import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type Redis from 'ioredis';
import { keyMeta } from '@gw/shared';
import type { ApiKeyRow, GatewaySyncEventRow } from '@gw/db';
import { REDIS } from '../redis/redis.module';
import { SUPABASE, GatewaySupabase } from '../supabase/supabase.module';
import { buildMetaHash } from './key-meta';

/**
 * Keeps Redis meta in sync with Postgres. Primary path = Supabase Realtime on
 * public.api_keys; a gateway_sync_events poller runs as a fallback so a dropped
 * Realtime connection cannot leave a revoked key live indefinitely.
 */
@Injectable()
export class KeysService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(KeysService.name);
  private channel: { unsubscribe: () => Promise<unknown> } | null = null;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(SUPABASE) private readonly supabase: GatewaySupabase,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.subscribeRealtime();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.channel) {
      await this.channel.unsubscribe().catch(() => undefined);
      this.channel = null;
    }
  }

  private subscribeRealtime(): void {
    if (typeof (this.supabase as any).channel !== 'function') {
      this.logger.warn('Supabase Realtime unavailable; relying on sync-event poller');
      return;
    }
    try {
      this.channel = (this.supabase as any)
        .channel('gateway:api_keys')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'api_keys' },
          (payload: { eventType: string; new: ApiKeyRow; old: Partial<ApiKeyRow> }) => {
            this.handleRealtime(payload).catch((e) =>
              this.logger.error(`Realtime handler error: ${(e as Error).message}`),
            );
          },
        )
        .subscribe();
      this.logger.log('Subscribed to Realtime on public.api_keys');
    } catch (e) {
      this.logger.error(`Failed to subscribe to Realtime: ${(e as Error).message}`);
    }
  }

  private async handleRealtime(payload: {
    eventType: string;
    new: ApiKeyRow;
    old: Partial<ApiKeyRow>;
  }): Promise<void> {
    if (payload.eventType === 'DELETE') {
      const prefix = payload.old?.key_prefix;
      if (prefix) await this.removeKey(prefix);
      return;
    }
    if (payload.new) await this.applyKeyRow(payload.new);
  }

  /** Upsert the Redis meta for a key row (status changes included). */
  async applyKeyRow(row: ApiKeyRow): Promise<void> {
    await this.redis.hset(keyMeta(row.key_prefix), buildMetaHash(row));
  }

  /** Drop a key's meta entirely (deleted key). */
  async removeKey(prefix: string): Promise<void> {
    await this.redis.del(keyMeta(prefix));
  }

  /**
   * Fallback poller: drain unconsumed gateway_sync_events and re-apply the
   * current DB state for each affected key, then mark them consumed.
   */
  @Interval(15_000)
  async pollSyncEvents(): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .from('gateway_sync_events')
        .select('id,event_type,api_key_id,payload,consumed_at,created_at')
        .is('consumed_at', null)
        .order('id', { ascending: true })
        .limit(100);
      if (error || !data || data.length === 0) return;

      const events = data as GatewaySyncEventRow[];
      const keyIds = [...new Set(events.map((e) => e.api_key_id).filter(Boolean))] as string[];
      if (keyIds.length > 0) {
        const { data: keys } = await this.supabase
          .from('api_keys')
          .select('*')
          .in('id', keyIds);
        for (const k of (keys ?? []) as ApiKeyRow[]) {
          await this.applyKeyRow(k);
        }
      }
      const ids = events.map((e) => e.id);
      await this.supabase
        .from('gateway_sync_events')
        .update({ consumed_at: new Date().toISOString() })
        .in('id', ids);
    } catch (e) {
      this.logger.error(`Sync-event poll failed: ${(e as Error).message}`);
    }
  }
}
