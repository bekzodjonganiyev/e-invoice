import RedisMock from 'ioredis-mock';
import { KeysService } from './keys.service';
import { keyMeta } from '@gw/shared';
import type { ApiKeyRow } from '@gw/db';

const baseRow: ApiKeyRow = {
  id: 'key-1',
  user_id: 'user-1',
  label: 'test',
  environment: 'live',
  key_prefix: 'gw_live_abcdef',
  key_hash: 'hash',
  monthly_limit: 100,
  current_usage: 0,
  current_period_start: '2026-07-01',
  rate_limit_per_min: null,
  status: 'active',
  expires_at: null,
  last_used_at: null,
  revoked_at: null,
  created_at: null,
  updated_at: null,
};

describe('KeysService sync', () => {
  let redis: any;
  let svc: KeysService;

  beforeEach(async () => {
    redis = new RedisMock();
    await redis.flushall();
    svc = new KeysService(redis, {} as any);
  });

  it('applyKeyRow upserts meta', async () => {
    await svc.applyKeyRow(baseRow);
    const meta = await redis.hgetall(keyMeta(baseRow.key_prefix));
    expect(meta.status).toBe('active');
    expect(meta.id).toBe('key-1');
  });

  it('a revoke status change updates meta immediately', async () => {
    await svc.applyKeyRow(baseRow);
    await svc.applyKeyRow({ ...baseRow, status: 'revoked', revoked_at: '2026-07-16T00:00:00Z' });
    const meta = await redis.hgetall(keyMeta(baseRow.key_prefix));
    expect(meta.status).toBe('revoked');
  });

  it('removeKey drops meta entirely', async () => {
    await svc.applyKeyRow(baseRow);
    await svc.removeKey(baseRow.key_prefix);
    const meta = await redis.hgetall(keyMeta(baseRow.key_prefix));
    expect(Object.keys(meta)).toHaveLength(0);
  });
});
