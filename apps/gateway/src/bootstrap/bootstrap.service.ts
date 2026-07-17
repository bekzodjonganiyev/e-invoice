import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type Redis from 'ioredis';
import { currentPeriodYM, keyMeta, usageCounter } from '@gw/shared';
import type { ActiveKeyBootstrapRow } from '@gw/db';
import { REDIS } from '../redis/redis.module';
import { SUPABASE, GatewaySupabase } from '../supabase/supabase.module';
import { buildMetaHash } from '../keys/key-meta';

/**
 * On startup, seed Redis from Supabase. Meta is refreshed (authoritative from DB),
 * but usage counters are seeded with SET NX so a persisted (newer) Redis value is
 * NEVER overwritten — Redis remains the runtime source of truth.
 */
@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(SUPABASE) private readonly supabase: GatewaySupabase,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seed(new Date());
  }

  async seed(now: Date): Promise<number> {
    const { data, error } = await this.supabase
      .from('active_keys_bootstrap')
      .select(
        'id,user_id,key_prefix,key_hash,monthly_limit,current_usage,current_period_start,rate_limit_per_min,status,environment,expires_at',
      );

    if (error) {
      this.logger.error(`Bootstrap seed failed: ${error.message}`);
      throw error;
    }

    const rows = (data ?? []) as ActiveKeyBootstrapRow[];
    const ym = currentPeriodYM(now);

    for (const row of rows) {
      await this.redis.hset(keyMeta(row.key_prefix), buildMetaHash(row));
      // Seed the current period counter WITHOUT clobbering an existing value.
      await this.redis.set(
        usageCounter(row.id, ym),
        String(row.current_usage ?? 0),
        'NX',
      );
    }

    this.logger.log(`Seeded ${rows.length} active key(s) into Redis`);
    return rows.length;
  }
}
