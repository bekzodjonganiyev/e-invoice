import { Global, Module, OnApplicationShutdown } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { CONFIG, GatewayConfig } from '../config/configuration';

export const REDIS = 'REDIS_CLIENT';

/**
 * Persistent ioredis client. Redis is the runtime source of truth for
 * counters/rate limits and must be configured with AOF persistence
 * (appendonly yes) so counters survive restarts.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [CONFIG],
      useFactory: (config: GatewayConfig) => {
        return new Redis(config.redisUrl, {
          maxRetriesPerRequest: null,
          enableReadyCheck: true,
        });
      },
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    try {
      await this.redis.quit();
    } catch {
      // ignore — shutting down anyway
    }
  }
}
