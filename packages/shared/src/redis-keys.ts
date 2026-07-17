/**
 * Redis key builders. Single source of truth for key naming across Gateway modules.
 */

/** Per-key metadata hash, looked up by the public prefix on the hot path. */
export function keyMeta(prefix: string): string {
  return `key:meta:${prefix}`;
}

/**
 * Period-scoped usage counter. The `{YYYY-MM}` segment means the next month's
 * key naturally starts at 0 — quota resets require no destructive job.
 */
export function usageCounter(keyId: string, ym: string): string {
  return `usage:${keyId}:${ym}`;
}

/** Per-minute rate-limit counter (TTL 60s). `minute` is a yyyyMMddHHmm stamp. */
export function rateLimit(keyId: string, minute: string): string {
  return `ratelimit:${keyId}:${minute}`;
}

/** Redis list acting as the buffered usage-event queue drained by the batch flush. */
export function usageQueue(): string {
  return 'usage:queue';
}
