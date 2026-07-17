import RedisMock from 'ioredis-mock';
import { BootstrapService } from './bootstrap.service';
import { keyMeta, usageCounter, currentPeriodYM } from '@gw/shared';
import type { ActiveKeyBootstrapRow } from '@gw/db';

function fakeSupabase(rows: ActiveKeyBootstrapRow[]) {
  return {
    from: () => ({
      select: async () => ({ data: rows, error: null }),
    }),
  } as any;
}

const row: ActiveKeyBootstrapRow = {
  id: 'key-1',
  user_id: 'user-1',
  key_prefix: 'gw_live_abcdef',
  key_hash: 'deadbeef',
  monthly_limit: 500,
  current_usage: 42,
  current_period_start: '2026-07-01',
  rate_limit_per_min: 60,
  status: 'active',
  environment: 'live',
  expires_at: null,
};

describe('BootstrapService.seed', () => {
  const now = new Date('2026-07-16T12:00:00Z');
  let redis: any;

  beforeEach(async () => {
    redis = new RedisMock();
    await redis.flushall();
  });

  it('seeds meta and the usage counter from the DB', async () => {
    const svc = new BootstrapService(redis, fakeSupabase([row]));
    const count = await svc.seed(now);
    expect(count).toBe(1);

    const meta = await redis.hgetall(keyMeta(row.key_prefix));
    expect(meta.id).toBe('key-1');
    expect(meta.monthly_limit).toBe('500');
    expect(meta.rate_limit_per_min).toBe('60');

    const used = await redis.get(usageCounter(row.id, currentPeriodYM(now)));
    expect(Number(used)).toBe(42);
  });

  it('uses SET NX — never overwrites an existing (persisted) Redis counter', async () => {
    // Simulate a persisted, newer Redis value before boot.
    await redis.set(usageCounter(row.id, currentPeriodYM(now)), '99');
    const svc = new BootstrapService(redis, fakeSupabase([row]));
    await svc.seed(now);

    const used = await redis.get(usageCounter(row.id, currentPeriodYM(now)));
    expect(Number(used)).toBe(99); // NOT overwritten by DB's 42
  });

  it('refreshes meta authoritatively even when the counter is preserved', async () => {
    await redis.set(usageCounter(row.id, currentPeriodYM(now)), '99');
    const svc = new BootstrapService(redis, fakeSupabase([{ ...row, status: 'exhausted' }]));
    await svc.seed(now);
    const meta = await redis.hgetall(keyMeta(row.key_prefix));
    expect(meta.status).toBe('exhausted');
  });
});
