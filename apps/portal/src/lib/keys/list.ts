import type { ApiKeyRow } from '@gw/db';

/**
 * Explicit column list for reading keys into the UI. Deliberately EXCLUDES
 * `key_hash` (also column-revoked at the DB for anon/authenticated) and never
 * includes any plaintext. This string is used directly in `.select(...)`.
 */
export const KEY_LIST_COLUMNS =
  'id,label,environment,key_prefix,monthly_limit,current_usage,rate_limit_per_min,status,expires_at,last_used_at,created_at';

/** Safe, browser-facing shape of an API key row. No hash, no plaintext. */
export interface KeyListItem {
  id: string;
  label: string | null;
  environment: string;
  key_prefix: string;
  monthly_limit: number;
  current_usage: number;
  rate_limit_per_min: number | null;
  status: string;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string | null;
}

/**
 * Project a raw key row down to the safe list item. Even if a caller
 * accidentally selected `key_hash`, this drops it before it reaches the client.
 */
export function toKeyListItem(row: Partial<ApiKeyRow> & { id: string; key_prefix: string }): KeyListItem {
  return {
    id: row.id,
    label: row.label ?? null,
    environment: (row.environment as string) ?? 'live',
    key_prefix: row.key_prefix,
    monthly_limit: row.monthly_limit ?? 0,
    current_usage: row.current_usage ?? 0,
    rate_limit_per_min: row.rate_limit_per_min ?? null,
    status: (row.status as string) ?? 'active',
    expires_at: row.expires_at ?? null,
    last_used_at: row.last_used_at ?? null,
    created_at: row.created_at ?? null,
  };
}
