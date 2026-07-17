import { describe, it, expect } from 'vitest';
import { bucketByDay } from './aggregate';

describe('bucketByDay', () => {
  const now = new Date('2026-07-16T12:00:00Z');

  it('returns a dense series with one bucket per day', () => {
    const buckets = bucketByDay([], now, 14);
    expect(buckets).toHaveLength(14);
    expect(buckets[13].day).toBe('2026-07-16');
    expect(buckets[0].day).toBe('2026-07-03');
    expect(buckets.every((b) => b.count === 0)).toBe(true);
  });

  it('counts events into the correct UTC day', () => {
    const buckets = bucketByDay(
      [
        { occurred_at: '2026-07-16T01:00:00Z' },
        { occurred_at: '2026-07-16T23:00:00Z' },
        { occurred_at: '2026-07-15T10:00:00Z' },
      ],
      now,
      14,
    );
    const byDay = Object.fromEntries(buckets.map((b) => [b.day, b.count]));
    expect(byDay['2026-07-16']).toBe(2);
    expect(byDay['2026-07-15']).toBe(1);
  });

  it('ignores events outside the window', () => {
    const buckets = bucketByDay([{ occurred_at: '2026-01-01T00:00:00Z' }], now, 14);
    expect(buckets.reduce((s, b) => s + b.count, 0)).toBe(0);
  });
});
