import RedisMock from 'ioredis-mock';
import { HttpException } from '@nestjs/common';
import { AuthService, AuthInput } from './auth.service';
import { RateLimitService } from '../ratelimit/rate-limit.service';
import { buildMetaHash } from '../keys/key-meta';
import {
  generateApiKey,
  hashApiKey,
  keyMeta,
  usageCounter,
  usageQueue,
  currentPeriodYM,
} from '@gw/shared';
import type { ActiveKeyBootstrapRow } from '@gw/db';

const PEPPER = 'unit-test-pepper';
const SECRET = 'apisix-shared-secret';

function makeConfig() {
  return {
    supabaseUrl: 'http://localhost',
    supabaseServiceRoleKey: 'x',
    redisUrl: 'redis://localhost:6379',
    apiKeyPepper: PEPPER,
    forwardAuthSecret: SECRET,
    port: 4000,
    testEnvRateLimitPerMinCeiling: 30,
    testEnvMonthlyLimitCeiling: 2000,
  };
}

function metaRow(over: Partial<ActiveKeyBootstrapRow>, keyHash: string): ActiveKeyBootstrapRow {
  return {
    id: 'key-1',
    user_id: 'user-1',
    key_prefix: 'gw_live_aaaaaa',
    key_hash: keyHash,
    monthly_limit: 1000,
    current_usage: 0,
    current_period_start: '2026-07-01',
    rate_limit_per_min: null,
    status: 'active',
    environment: 'live',
    expires_at: null,
    ...over,
  };
}

/** Run authorize and return the deny HTTP status (fails the test if it resolves). */
async function denyStatus(fn: () => Promise<unknown>): Promise<number> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof HttpException) return e.getStatus();
    throw e;
  }
  throw new Error('expected authorize() to reject, but it resolved');
}

describe('AuthService.authorize', () => {
  const now = new Date('2026-07-16T12:30:00Z');
  let redis: any;
  let svc: AuthService;

  async function seedKey(
    over: Partial<ActiveKeyBootstrapRow> = {},
    env: 'live' | 'test' = 'live',
  ) {
    const { fullKey, keyPrefix } = generateApiKey(env);
    const keyHash = hashApiKey(fullKey, PEPPER);
    const row = metaRow({ key_prefix: keyPrefix, environment: env, ...over }, keyHash);
    await redis.hset(keyMeta(keyPrefix), buildMetaHash(row));
    return { fullKey, keyPrefix, row };
  }

  function bearer(fullKey: string): AuthInput {
    return { secret: SECRET, authorization: `Bearer ${fullKey}`, method: 'GET', uri: '/v1/x' };
  }

  beforeEach(async () => {
    redis = new RedisMock();
    await redis.flushall(); // ioredis-mock shares an in-process store across instances
    svc = new AuthService(redis, makeConfig() as any, new RateLimitService(redis));
  });

  it('200: valid key returns identity and records usage', async () => {
    const { fullKey, row } = await seedKey();
    const res = await svc.authorize(bearer(fullKey), now);
    expect(res).toEqual({ userId: row.user_id, apiKeyId: row.id });

    const used = await redis.get(usageCounter(row.id, currentPeriodYM(now)));
    expect(Number(used)).toBe(1);
    expect(await redis.llen(usageQueue())).toBe(1);
  });

  it('401: wrong X-Gateway-Secret before any key logic', async () => {
    const { fullKey } = await seedKey();
    expect(await denyStatus(() => svc.authorize({ ...bearer(fullKey), secret: 'wrong' }, now))).toBe(
      401,
    );
    expect(await redis.llen(usageQueue())).toBe(0);
  });

  it('401: missing key', async () => {
    expect(
      await denyStatus(() => svc.authorize({ secret: SECRET, method: 'GET', uri: '/' }, now)),
    ).toBe(401);
  });

  it('401: unknown key (no meta)', async () => {
    const { fullKey } = generateApiKey('live');
    expect(await denyStatus(() => svc.authorize(bearer(fullKey), now))).toBe(401);
  });

  it('401: hash mismatch (right prefix, wrong body)', async () => {
    const { keyPrefix } = await seedKey();
    const forged = `${keyPrefix}ZZZZZZZZZZ`;
    expect(await denyStatus(() => svc.authorize(bearer(forged), now))).toBe(401);
  });

  it('401: revoked key', async () => {
    const { fullKey } = await seedKey({ status: 'revoked' });
    expect(await denyStatus(() => svc.authorize(bearer(fullKey), now))).toBe(401);
  });

  it('403: expired via expires_at in the past', async () => {
    const { fullKey } = await seedKey({ expires_at: '2026-07-01T00:00:00Z' });
    expect(await denyStatus(() => svc.authorize(bearer(fullKey), now))).toBe(403);
  });

  it('403: expired via status=expired', async () => {
    const { fullKey } = await seedKey({ status: 'expired' });
    expect(await denyStatus(() => svc.authorize(bearer(fullKey), now))).toBe(403);
  });

  it('429: over rate limit', async () => {
    const { fullKey } = await seedKey({ rate_limit_per_min: 2 });
    await svc.authorize(bearer(fullKey), now);
    await svc.authorize(bearer(fullKey), now);
    expect(await denyStatus(() => svc.authorize(bearer(fullKey), now))).toBe(429);
  });

  it('429: quota exhausted flips meta status to exhausted', async () => {
    const { fullKey, keyPrefix, row } = await seedKey({ monthly_limit: 1 });
    await svc.authorize(bearer(fullKey), now); // usage now 1 == limit
    expect(await denyStatus(() => svc.authorize(bearer(fullKey), now))).toBe(429);

    expect(await redis.hget(keyMeta(keyPrefix), 'status')).toBe('exhausted');
    expect(Number(await redis.get(usageCounter(row.id, currentPeriodYM(now))))).toBe(1);
    expect(await redis.llen(usageQueue())).toBe(1);
  });

  it('INCR and queue push happen only on 200 (deny paths record nothing)', async () => {
    const { fullKey } = await seedKey({ status: 'revoked' });
    await svc.authorize(bearer(fullKey), now).catch(() => undefined);
    expect(await redis.llen(usageQueue())).toBe(0);
  });

  it('month rollover: a new YYYY-MM counter starts at 0', async () => {
    const { fullKey, row } = await seedKey({ monthly_limit: 5 });
    const july = new Date('2026-07-31T23:59:00Z');
    const august = new Date('2026-08-01T00:01:00Z');
    await svc.authorize(bearer(fullKey), july);
    await svc.authorize(bearer(fullKey), july);
    expect(Number(await redis.get(usageCounter(row.id, '2026-07')))).toBe(2);
    expect(await redis.get(usageCounter(row.id, '2026-08'))).toBeNull();
    await svc.authorize(bearer(fullKey), august);
    expect(Number(await redis.get(usageCounter(row.id, '2026-08')))).toBe(1);
  });

  it('accepts the apikey header as an alternative to Authorization', async () => {
    const { fullKey, row } = await seedKey();
    const res = await svc.authorize(
      { secret: SECRET, apikey: fullKey, method: 'POST', uri: '/v1/y' },
      now,
    );
    expect(res.apiKeyId).toBe(row.id);
  });

  describe('environment cross-check', () => {
    it('200: a test key with matching DB environment is authorized', async () => {
      const { fullKey, row } = await seedKey({}, 'test');
      const res = await svc.authorize(bearer(fullKey), now);
      expect(res).toEqual({ userId: row.user_id, apiKeyId: row.id });
    });

    it('401: a live-prefixed key whose DB row says environment=test is rejected', async () => {
      // Simulates drift between the key's own gw_live_ prefix and a
      // hand-edited/stale `api_keys.environment` column.
      const { fullKey } = await seedKey({ environment: 'test' });
      expect(await denyStatus(() => svc.authorize(bearer(fullKey), now))).toBe(401);
    });

    it('401: a test-prefixed key whose DB row says environment=live is rejected', async () => {
      const { fullKey } = await seedKey({ environment: 'live' }, 'test');
      expect(await denyStatus(() => svc.authorize(bearer(fullKey), now))).toBe(401);
    });
  });

  describe('test-environment ceilings', () => {
    it('429: test key rate limit is capped even when the DB row allows more', async () => {
      const { fullKey } = await seedKey({ rate_limit_per_min: 1000 }, 'test');
      for (let i = 0; i < 30; i++) {
        await svc.authorize(bearer(fullKey), now);
      }
      // Ceiling (from makeConfig) is 30/min — the 31st call must be denied
      // even though the key row allows 1000.
      expect(await denyStatus(() => svc.authorize(bearer(fullKey), now))).toBe(429);
    });

    it('429: test key monthly quota is capped even when the DB row allows more', async () => {
      const { fullKey, keyPrefix, row } = await seedKey(
        { monthly_limit: 1_000_000, rate_limit_per_min: null },
        'test',
      );
      // One call per distinct minute so the per-minute ceiling never trips —
      // only the monthly-quota ceiling is under test here.
      let t = now.getTime();
      for (let i = 0; i < 2000; i++) {
        await svc.authorize(bearer(fullKey), new Date(t));
        t += 60_000;
      }
      // Ceiling (from makeConfig) is 2000/month.
      expect(await denyStatus(() => svc.authorize(bearer(fullKey), new Date(t)))).toBe(429);
      expect(await redis.hget(keyMeta(keyPrefix), 'status')).toBe('exhausted');
      expect(Number(await redis.get(usageCounter(row.id, currentPeriodYM(now))))).toBe(2000);
    });

    it('live keys are unaffected by the test-environment ceilings', async () => {
      const { fullKey } = await seedKey({ rate_limit_per_min: null, monthly_limit: 1_000_000 });
      for (let i = 0; i < 30; i++) {
        await svc.authorize(bearer(fullKey), now);
      }
      // A live key with no rate limit configured must NOT hit the 30/min
      // ceiling that only applies to test keys.
      const res = await svc.authorize(bearer(fullKey), now);
      expect(res).toBeDefined();
    });
  });
});
