import type { ActiveKeyBootstrapRow, ApiKeyRow, ApiKeyStatus } from '@gw/db';

/** Parsed, typed view of the Redis `key:meta:{prefix}` hash. */
export interface KeyMeta {
  id: string;
  userId: string;
  keyHash: string;
  monthlyLimit: number;
  rateLimitPerMin: number | null;
  status: ApiKeyStatus;
  environment: string;
  expiresAt: string | null;
}

type MetaSource = ActiveKeyBootstrapRow | ApiKeyRow;

/** Serialize a DB row into the flat string map stored in the Redis meta hash. */
export function buildMetaHash(row: MetaSource): Record<string, string> {
  return {
    id: row.id,
    user_id: row.user_id,
    key_hash: row.key_hash,
    monthly_limit: String(row.monthly_limit),
    rate_limit_per_min: row.rate_limit_per_min == null ? '' : String(row.rate_limit_per_min),
    status: row.status,
    environment: row.environment,
    expires_at: row.expires_at ?? '',
  };
}

/** Parse an HGETALL result back into a typed KeyMeta, or null if absent/empty. */
export function parseMetaHash(hash: Record<string, string> | null | undefined): KeyMeta | null {
  if (!hash || Object.keys(hash).length === 0 || !hash.id || !hash.key_hash) {
    return null;
  }
  const rl = hash.rate_limit_per_min;
  return {
    id: hash.id,
    userId: hash.user_id,
    keyHash: hash.key_hash,
    monthlyLimit: Number(hash.monthly_limit),
    rateLimitPerMin: rl === '' || rl == null ? null : Number(rl),
    status: hash.status as ApiKeyStatus,
    environment: hash.environment,
    expiresAt: hash.expires_at === '' || hash.expires_at == null ? null : hash.expires_at,
  };
}
