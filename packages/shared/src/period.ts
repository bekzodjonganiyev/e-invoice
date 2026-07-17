/** Billing/usage period helpers. All computations are UTC to avoid TZ drift. */

/** Current period as `YYYY-MM` (UTC) for the given date (defaults to now at call time). */
export function currentPeriodYM(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** Minute-resolution stamp `yyyyMMddHHmm` (UTC) used for rate-limit keys. */
export function rateLimitStamp(date: Date): string {
  const y = date.getUTCFullYear();
  const mo = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');
  const mi = String(date.getUTCMinutes()).padStart(2, '0');
  return `${y}${mo}${d}${h}${mi}`;
}
