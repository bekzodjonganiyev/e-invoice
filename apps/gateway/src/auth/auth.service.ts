import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type Redis from 'ioredis';
import {
  currentPeriodYM,
  hashApiKey,
  keyMeta,
  parseKeyPrefix,
  safeCompareHex,
  usageCounter,
  usageQueue,
} from '@gw/shared';
import { CONFIG, GatewayConfig } from '../config/configuration';
import { REDIS } from '../redis/redis.module';
import { RateLimitService } from '../ratelimit/rate-limit.service';
import { parseMetaHash } from '../keys/key-meta';
import { KEY_STATUS_QUEUE } from '../redis/redis-keys';

export interface AuthInput {
  /** Shared secret header (X-Gateway-Secret) proving the caller is APISIX. */
  secret: string | undefined;
  /** Raw Authorization header value, e.g. "Bearer gw_live_xxx". */
  authorization?: string;
  /** Alternative apikey header. */
  apikey?: string;
  method: string;
  uri: string;
  requestId?: string;
}

export interface AuthResult {
  userId: string;
  apiKeyId: string;
}

/** Usage-event payload pushed onto the batch queue on every authorized request. */
export interface QueuedUsageEvent {
  api_key_id: string;
  user_id: string;
  method: string;
  source_path: string;
  occurred_at: string;
  request_id: string | null;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CONFIG) private readonly config: GatewayConfig,
    private readonly rateLimit: RateLimitService,
  ) {}

  /** Extract the plaintext key from Authorization: Bearer <key> or apikey header. */
  private extractKey(input: AuthInput): string | null {
    if (input.authorization) {
      const m = /^Bearer\s+(.+)$/i.exec(input.authorization.trim());
      if (m) return m[1].trim();
    }
    if (input.apikey && input.apikey.trim() !== '') {
      return input.apikey.trim();
    }
    return null;
  }

  /**
   * Authorize a forward-auth request. Returns the identity on success or throws
   * an HttpException whose status APISIX relays to the client.
   */
  async authorize(input: AuthInput, now: Date = new Date()): Promise<AuthResult> {
    // 0. Trust gate — only APISIX (with the shared secret) may call /auth.
    if (
      !this.config.forwardAuthSecret ||
      input.secret !== this.config.forwardAuthSecret
    ) {
      throw new UnauthorizedException('Forbidden');
    }

    // 1. Missing key.
    const fullKey = this.extractKey(input);
    if (!fullKey) {
      throw new UnauthorizedException('Missing API key');
    }

    // 2. Prefix lookup.
    const prefix = parseKeyPrefix(fullKey);
    if (!prefix) {
      throw new UnauthorizedException('Invalid API key');
    }
    const rawMeta = await this.redis.hgetall(keyMeta(prefix));
    const meta = parseMetaHash(rawMeta);
    if (!meta) {
      throw new UnauthorizedException('Unknown API key');
    }

    // 3. Constant-time hash compare.
    const computed = hashApiKey(fullKey, this.config.apiKeyPepper);
    if (!safeCompareHex(computed, meta.keyHash)) {
      throw new UnauthorizedException('Invalid API key');
    }

    // 4. Status / expiry.
    if (meta.status === 'revoked') {
      throw new UnauthorizedException('API key revoked');
    }
    const expired =
      meta.status === 'expired' ||
      (meta.expiresAt != null && new Date(meta.expiresAt).getTime() < now.getTime());
    if (expired) {
      throw new ForbiddenException('API key expired');
    }

    // 5. Rate limit.
    const withinRate = await this.rateLimit.check(meta.id, meta.rateLimitPerMin, now);
    if (!withinRate) {
      throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }

    // 6. Quota.
    const ym = currentPeriodYM(now);
    const counterKey = usageCounter(meta.id, ym);
    const usedRaw = await this.redis.get(counterKey);
    const used = usedRaw ? Number(usedRaw) : 0;
    if (used >= meta.monthlyLimit) {
      await this.redis.hset(keyMeta(prefix), 'status', 'exhausted');
      await this.redis.lpush(
        KEY_STATUS_QUEUE,
        JSON.stringify({ api_key_id: meta.id, status: 'exhausted' }),
      );
      throw new HttpException('Monthly quota exhausted', HttpStatus.TOO_MANY_REQUESTS);
    }

    // 7. Authorize: record usage (pre-flight, 1 unit per authorized attempt).
    await this.redis.incr(counterKey);
    const event: QueuedUsageEvent = {
      api_key_id: meta.id,
      user_id: meta.userId,
      method: input.method,
      source_path: input.uri,
      occurred_at: now.toISOString(),
      request_id: input.requestId ?? null,
    };
    await this.redis.lpush(usageQueue(), JSON.stringify(event));

    return { userId: meta.userId, apiKeyId: meta.id };
  }

  /** Narrow helper so callers can special-case deny statuses if needed. */
  isDeny(err: unknown): err is HttpException {
    return err instanceof HttpException;
  }
}
