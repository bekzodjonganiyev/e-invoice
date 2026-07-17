import RedisMock from 'ioredis-mock';
import { RateLimitService } from './rate-limit.service';
import { rateLimit, rateLimitStamp } from '@gw/shared';

describe('RateLimitService', () => {
  const now = new Date('2026-07-16T12:30:00Z');
  let redis: any;
  let svc: RateLimitService;

  beforeEach(async () => {
    redis = new RedisMock();
    await redis.flushall();
    svc = new RateLimitService(redis);
  });

  it('allows requests up to the limit and denies beyond it', async () => {
    const limit = 3;
    expect(await svc.check('k1', limit, now)).toBe(true); // 1
    expect(await svc.check('k1', limit, now)).toBe(true); // 2
    expect(await svc.check('k1', limit, now)).toBe(true); // 3
    expect(await svc.check('k1', limit, now)).toBe(false); // 4 — over
  });

  it('always allows when no limit is configured', async () => {
    for (let i = 0; i < 100; i++) {
      expect(await svc.check('k1', null, now)).toBe(true);
    }
  });

  it('sets a 60s TTL on the counter key', async () => {
    await svc.check('k1', 5, now);
    const ttl = await redis.ttl(rateLimit('k1', rateLimitStamp(now)));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it('resets in a new minute window', async () => {
    const min1 = new Date('2026-07-16T12:30:10Z');
    const min2 = new Date('2026-07-16T12:31:10Z');
    expect(await svc.check('k1', 1, min1)).toBe(true);
    expect(await svc.check('k1', 1, min1)).toBe(false); // over in minute 1
    expect(await svc.check('k1', 1, min2)).toBe(true); // fresh window
  });
});
