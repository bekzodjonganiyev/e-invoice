import RedisMock from 'ioredis-mock';
import { UsageService } from './usage.service';
import { usageCounter, usageQueue, currentPeriodYM } from '@gw/shared';
import { KEY_STATUS_QUEUE } from '../redis/redis-keys';
import type { QueuedUsageEvent } from '../auth/auth.service';

function fakeSupabase() {
  const inserts: any[] = [];
  const updates: any[] = [];
  const client = {
    inserts,
    updates,
    from(table: string) {
      return {
        insert: async (rows: any) => {
          inserts.push({ table, rows });
          return { error: null };
        },
        update(values: any) {
          return {
            eq: async (col: string, val: any) => {
              updates.push({ table, values, col, val });
              return { error: null };
            },
          };
        },
      };
    },
  };
  return client as any;
}

function event(over: Partial<QueuedUsageEvent> = {}): QueuedUsageEvent {
  return {
    api_key_id: 'key-1',
    user_id: 'user-1',
    method: 'GET',
    source_path: '/v1/x',
    occurred_at: '2026-07-16T12:30:00Z',
    request_id: 'req-1',
    ...over,
  };
}

describe('UsageService.flush', () => {
  const now = new Date('2026-07-16T12:31:00Z');
  let redis: any;
  let supabase: any;
  let svc: UsageService;

  beforeEach(async () => {
    redis = new RedisMock();
    await redis.flushall();
    supabase = fakeSupabase();
    svc = new UsageService(redis, supabase);
  });

  it('no-ops on an empty queue', async () => {
    expect(await svc.flush(now)).toBe(0);
    expect(supabase.inserts).toHaveLength(0);
  });

  it('bulk-inserts queued usage events in one insert call', async () => {
    await redis.lpush(usageQueue(), JSON.stringify(event()));
    await redis.lpush(usageQueue(), JSON.stringify(event({ request_id: 'req-2' })));

    const n = await svc.flush(now);
    expect(n).toBe(2);

    const usageInserts = supabase.inserts.filter((i: any) => i.table === 'usage_events');
    expect(usageInserts).toHaveLength(1);
    expect(usageInserts[0].rows).toHaveLength(2);
    expect(usageInserts[0].rows[0]).toMatchObject({
      api_key_id: 'key-1',
      user_id: 'user-1',
      method: 'GET',
      source_path: '/v1/x',
      billable: true,
    });
  });

  it('drains the queue so a second flush is a no-op', async () => {
    await redis.lpush(usageQueue(), JSON.stringify(event()));
    await svc.flush(now);
    expect(await redis.llen(usageQueue())).toBe(0);
    expect(await svc.flush(now)).toBe(0);
  });

  it('overwrites current_usage with the absolute Redis counter (idempotent, not additive)', async () => {
    const ym = currentPeriodYM(now);
    await redis.set(usageCounter('key-1', ym), '7');
    await redis.lpush(usageQueue(), JSON.stringify(event()));

    await svc.flush(now);

    const keyUpdate = supabase.updates.find(
      (u: any) => u.table === 'api_keys' && u.col === 'id' && u.val === 'key-1',
    );
    expect(keyUpdate).toBeDefined();
    expect(keyUpdate.values.current_usage).toBe(7); // absolute, not += queued count
    expect(keyUpdate.values.current_period_start).toBe(`${ym}-01`);
    expect(keyUpdate.values.last_used_at).toBe('2026-07-16T12:30:00Z');
  });

  it('applies queued key-status changes to api_keys.status', async () => {
    await redis.lpush(
      KEY_STATUS_QUEUE,
      JSON.stringify({ api_key_id: 'key-9', status: 'exhausted' }),
    );
    await svc.flush(now);
    const statusUpdate = supabase.updates.find(
      (u: any) => u.table === 'api_keys' && u.val === 'key-9',
    );
    expect(statusUpdate).toBeDefined();
    expect(statusUpdate.values.status).toBe('exhausted');
  });
});
