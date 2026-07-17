import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import RedisMock from 'ioredis-mock';
import { AppModule } from '../src/app.module';
import { CONFIG } from '../src/config/configuration';
import { REDIS } from '../src/redis/redis.module';
import { SUPABASE } from '../src/supabase/supabase.module';
import { buildMetaHash } from '../src/keys/key-meta';
import { generateApiKey, hashApiKey, keyMeta } from '@gw/shared';
import type { ActiveKeyBootstrapRow } from '@gw/db';

const PEPPER = 'e2e-pepper';
const SECRET = 'e2e-forward-auth-secret';

const testConfig = {
  supabaseUrl: 'http://localhost',
  supabaseServiceRoleKey: 'x',
  redisUrl: 'redis://localhost:6379',
  apiKeyPepper: PEPPER,
  forwardAuthSecret: SECRET,
  port: 4000,
};

// Minimal stub: bootstrap select() resolves empty; no channel() -> Realtime skipped.
// insert/update are no-op fakes so the shutdown usage-flush stays quiet.
const supabaseStub = {
  from: () => ({
    select: async () => ({ data: [], error: null }),
    insert: async () => ({ error: null }),
    update: () => ({ eq: async () => ({ error: null }) }),
  }),
};

function metaRow(over: Partial<ActiveKeyBootstrapRow>, keyHash: string): ActiveKeyBootstrapRow {
  return {
    id: 'id-' + (over.key_prefix ?? 'x'),
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

describe('GET /auth (forward-auth) e2e', () => {
  let app: INestApplication;
  let redis: any;

  async function seed(over: Partial<ActiveKeyBootstrapRow> = {}) {
    const { fullKey, keyPrefix } = generateApiKey('live');
    const keyHash = hashApiKey(fullKey, PEPPER);
    const row = metaRow({ key_prefix: keyPrefix, id: 'id-' + keyPrefix, ...over }, keyHash);
    await redis.hset(keyMeta(keyPrefix), buildMetaHash(row));
    return { fullKey, keyPrefix, row };
  }

  beforeAll(async () => {
    redis = new RedisMock();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CONFIG)
      .useValue(testConfig)
      .overrideProvider(REDIS)
      .useValue(redis)
      .overrideProvider(SUPABASE)
      .useValue(supabaseStub)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();

  it('200: valid key with correct secret returns identity headers', async () => {
    const { fullKey, row } = await seed();
    const res = await request(server())
      .get('/auth')
      .set('X-Gateway-Secret', SECRET)
      .set('Authorization', `Bearer ${fullKey}`)
      .set('X-Forwarded-Method', 'GET')
      .set('X-Forwarded-Uri', '/v1/documents');
    expect(res.status).toBe(200);
    expect(res.headers['x-user-id']).toBe(row.user_id);
    expect(res.headers['x-api-key-id']).toBe(row.id);
  });

  it('401: missing X-Gateway-Secret (before any key logic)', async () => {
    const { fullKey } = await seed();
    const res = await request(server())
      .get('/auth')
      .set('Authorization', `Bearer ${fullKey}`);
    expect(res.status).toBe(401);
  });

  it('401: wrong X-Gateway-Secret', async () => {
    const { fullKey } = await seed();
    const res = await request(server())
      .get('/auth')
      .set('X-Gateway-Secret', 'nope')
      .set('Authorization', `Bearer ${fullKey}`);
    expect(res.status).toBe(401);
  });

  it('401: missing key', async () => {
    const res = await request(server()).get('/auth').set('X-Gateway-Secret', SECRET);
    expect(res.status).toBe(401);
  });

  it('401: unknown key', async () => {
    const { fullKey } = generateApiKey('live');
    const res = await request(server())
      .get('/auth')
      .set('X-Gateway-Secret', SECRET)
      .set('Authorization', `Bearer ${fullKey}`);
    expect(res.status).toBe(401);
  });

  it('401: revoked key', async () => {
    const { fullKey } = await seed({ status: 'revoked' });
    const res = await request(server())
      .get('/auth')
      .set('X-Gateway-Secret', SECRET)
      .set('Authorization', `Bearer ${fullKey}`);
    expect(res.status).toBe(401);
  });

  it('403: expired key', async () => {
    const { fullKey } = await seed({ expires_at: '2020-01-01T00:00:00Z' });
    const res = await request(server())
      .get('/auth')
      .set('X-Gateway-Secret', SECRET)
      .set('Authorization', `Bearer ${fullKey}`);
    expect(res.status).toBe(403);
  });

  it('429: rate limited', async () => {
    const { fullKey } = await seed({ rate_limit_per_min: 1 });
    await request(server())
      .get('/auth')
      .set('X-Gateway-Secret', SECRET)
      .set('Authorization', `Bearer ${fullKey}`);
    const res = await request(server())
      .get('/auth')
      .set('X-Gateway-Secret', SECRET)
      .set('Authorization', `Bearer ${fullKey}`);
    expect(res.status).toBe(429);
  });

  it('429: quota exhausted and meta flips to exhausted', async () => {
    const { fullKey, keyPrefix } = await seed({ monthly_limit: 1 });
    await request(server())
      .get('/auth')
      .set('X-Gateway-Secret', SECRET)
      .set('Authorization', `Bearer ${fullKey}`);
    const res = await request(server())
      .get('/auth')
      .set('X-Gateway-Secret', SECRET)
      .set('Authorization', `Bearer ${fullKey}`);
    expect(res.status).toBe(429);
    expect(await redis.hget(keyMeta(keyPrefix), 'status')).toBe('exhausted');
  });
});
