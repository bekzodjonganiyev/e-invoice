import { describe, it, expect } from 'vitest';
import { keyMeta, usageCounter, rateLimit, usageQueue } from './redis-keys';

describe('redis key builders', () => {
  it('keyMeta(prefix) = key:meta:{prefix}', () => {
    expect(keyMeta('gw_live_abc123')).toBe('key:meta:gw_live_abc123');
  });

  it('usageCounter(id, ym) = usage:{id}:{YYYY-MM}', () => {
    expect(usageCounter('k1', '2026-07')).toBe('usage:k1:2026-07');
  });

  it('rateLimit(id, minute) = ratelimit:{id}:{yyyyMMddHHmm}', () => {
    expect(rateLimit('k1', '202607161230')).toBe('ratelimit:k1:202607161230');
  });

  it('usageQueue() = usage:queue', () => {
    expect(usageQueue()).toBe('usage:queue');
  });
});
