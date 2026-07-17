/** Pure usage aggregation helpers (unit-tested; no I/O). */

export interface DailyBucket {
  day: string; // YYYY-MM-DD (UTC)
  count: number;
}

/**
 * Bucket usage events by UTC day over the last `days` days ending at `now`,
 * inclusive. Days with no events are present with count 0 so charts are dense.
 */
export function bucketByDay(
  events: { occurred_at: string }[],
  now: Date,
  days = 14,
): DailyBucket[] {
  const buckets = new Map<string, number>();
  const order: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, 0);
    order.push(key);
  }
  for (const e of events) {
    const key = e.occurred_at.slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return order.map((day) => ({ day, count: buckets.get(day) ?? 0 }));
}
