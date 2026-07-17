import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type Redis from 'ioredis';
import { currentPeriodYM, usageCounter, usageQueue } from '@gw/shared';
import type { UsageEventInsert } from '@gw/db';
import { REDIS } from '../redis/redis.module';
import { SUPABASE, GatewaySupabase } from '../supabase/supabase.module';
import { QueuedUsageEvent } from '../auth/auth.service';
import { KEY_STATUS_QUEUE } from '../redis/redis-keys';

const FLUSH_CHUNK = 500;

/**
 * Periodically drains the Redis usage queue and bulk-inserts usage_events,
 * then mirrors the authoritative Redis counter back into api_keys.current_usage
 * (overwrite = idempotent, never additive). Also flushes on shutdown.
 */
@Injectable()
export class UsageService implements OnApplicationShutdown {
  private readonly logger = new Logger(UsageService.name);

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(SUPABASE) private readonly supabase: GatewaySupabase,
  ) {}

  @Interval(5_000)
  async scheduledFlush(): Promise<void> {
    try {
      await this.flush(new Date());
    } catch (e) {
      this.logger.error(`Usage flush failed: ${(e as Error).message}`);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    try {
      await this.flush(new Date());
    } catch (e) {
      this.logger.error(`Shutdown flush failed: ${(e as Error).message}`);
    }
  }

  private async drain(queueKey: string, max: number): Promise<string[]> {
    const out: string[] = [];
    for (let i = 0; i < max; i++) {
      const item = await this.redis.rpop(queueKey);
      if (item == null) break;
      out.push(item);
    }
    return out;
  }

  /** Drain queues and reconcile DB. Returns the number of usage events flushed. */
  async flush(now: Date): Promise<number> {
    await this.flushKeyStatuses();

    const raw = await this.drain(usageQueue(), FLUSH_CHUNK);
    if (raw.length === 0) return 0;

    const events: QueuedUsageEvent[] = [];
    for (const line of raw) {
      try {
        events.push(JSON.parse(line));
      } catch {
        this.logger.warn('Dropping malformed usage-queue entry');
      }
    }
    if (events.length === 0) return 0;

    // 1. Bulk insert append-only usage_events.
    const rows: UsageEventInsert[] = events.map((e) => ({
      api_key_id: e.api_key_id,
      user_id: e.user_id,
      method: e.method,
      source_path: e.source_path,
      request_id: e.request_id ?? null,
      occurred_at: e.occurred_at,
      billable: true,
    }));
    const { error: insErr } = await this.supabase.from('usage_events').insert(rows);
    if (insErr) {
      // Re-queue so nothing is lost, then surface the error.
      for (const line of raw) await this.redis.lpush(usageQueue(), line);
      throw insErr;
    }

    // 2. Mirror the authoritative Redis counter into api_keys per affected key.
    const ym = currentPeriodYM(now);
    const periodStart = `${ym}-01`;
    const latestByKey = new Map<string, string>();
    for (const e of events) {
      const prev = latestByKey.get(e.api_key_id);
      if (!prev || e.occurred_at > prev) latestByKey.set(e.api_key_id, e.occurred_at);
    }

    for (const [keyId, lastUsedAt] of latestByKey) {
      const counter = await this.redis.get(usageCounter(keyId, ym));
      const current = counter ? Number(counter) : 0;
      await this.supabase
        .from('api_keys')
        .update({
          current_usage: current,
          current_period_start: periodStart,
          last_used_at: lastUsedAt,
          updated_at: now.toISOString(),
        })
        .eq('id', keyId);
    }

    this.logger.log(`Flushed ${events.length} usage event(s) for ${latestByKey.size} key(s)`);
    return events.length;
  }

  /** Apply queued key-status changes (e.g. exhaustion) to api_keys.status. */
  private async flushKeyStatuses(): Promise<void> {
    const raw = await this.drain(KEY_STATUS_QUEUE, FLUSH_CHUNK);
    for (const line of raw) {
      try {
        const { api_key_id, status } = JSON.parse(line);
        await this.supabase
          .from('api_keys')
          .update({ status, updated_at: new Date().toISOString() })
          .eq('id', api_key_id);
      } catch (e) {
        this.logger.warn(`Dropping malformed status-queue entry: ${(e as Error).message}`);
      }
    }
  }
}
