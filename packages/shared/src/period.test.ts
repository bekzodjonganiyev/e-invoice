import { describe, it, expect } from 'vitest';
import { currentPeriodYM, rateLimitStamp } from './period';

describe('currentPeriodYM', () => {
  it('formats a date as YYYY-MM (UTC)', () => {
    expect(currentPeriodYM(new Date('2026-07-16T12:30:00Z'))).toBe('2026-07');
  });

  it('zero-pads single-digit months', () => {
    expect(currentPeriodYM(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01');
    expect(currentPeriodYM(new Date('2026-09-30T23:59:59Z'))).toBe('2026-09');
  });

  it('rolls to the next period at the month boundary', () => {
    const lastSecond = currentPeriodYM(new Date('2026-07-31T23:59:59Z'));
    const firstSecond = currentPeriodYM(new Date('2026-08-01T00:00:00Z'));
    expect(lastSecond).toBe('2026-07');
    expect(firstSecond).toBe('2026-08');
    expect(lastSecond).not.toBe(firstSecond);
  });

  it('handles the year boundary', () => {
    expect(currentPeriodYM(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12');
    expect(currentPeriodYM(new Date('2027-01-01T00:00:00Z'))).toBe('2027-01');
  });
});

describe('rateLimitStamp', () => {
  it('formats a date as yyyyMMddHHmm (UTC, minute resolution)', () => {
    expect(rateLimitStamp(new Date('2026-07-16T12:30:45Z'))).toBe('202607161230');
  });

  it('changes each minute but is stable within a minute', () => {
    const a = rateLimitStamp(new Date('2026-07-16T12:30:00Z'));
    const b = rateLimitStamp(new Date('2026-07-16T12:30:59Z'));
    const c = rateLimitStamp(new Date('2026-07-16T12:31:00Z'));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
