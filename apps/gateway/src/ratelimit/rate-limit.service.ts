import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { rateLimit } from '@gw/shared';
import { rateLimitStamp } from '@gw/shared';
import { REDIS } from '../redis/redis.module';

@Injectable()
export class RateLimitService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /**
   * Increment the per-minute counter for a key and report whether the request
   * is within the limit. A null/undefined limit means "no rate limit".
   * The counter key has a 60s TTL so it self-expires.
   */
  async check(keyId: string, limitPerMin: number | null, now: Date): Promise<boolean> {
    if (limitPerMin == null) return true;
    const rkey = rateLimit(keyId, rateLimitStamp(now));
    const count = await this.redis.incr(rkey);
    if (count === 1) {
      await this.redis.expire(rkey, 60);
    }
    return count <= limitPerMin;
  }
}
