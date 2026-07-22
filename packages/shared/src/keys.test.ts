import { describe, it, expect } from 'vitest';
import {
  generateApiKey,
  deriveKeyPrefix,
  parseKeyPrefix,
  parseKeyEnvironment,
  hashApiKey,
  safeCompareHex,
  KEY_PREFIX_TOKEN_LEN,
} from './keys';

describe('generateApiKey', () => {
  it('produces the gw_{env}_{token} format', () => {
    const live = generateApiKey('live');
    expect(live.fullKey).toMatch(/^gw_live_[0-9A-Za-z]+$/);
    const test = generateApiKey('test');
    expect(test.fullKey).toMatch(/^gw_test_[0-9A-Za-z]+$/);
  });

  it('embeds the env in the key and prefix', () => {
    const { fullKey, keyPrefix } = generateApiKey('live');
    expect(fullKey.startsWith('gw_live_')).toBe(true);
    expect(keyPrefix.startsWith('gw_live_')).toBe(true);
  });

  it('key_prefix = gw_{env}_ + first 6 chars of the token', () => {
    const { fullKey, keyPrefix } = generateApiKey('live');
    const token = fullKey.slice('gw_live_'.length);
    expect(keyPrefix).toBe(`gw_live_${token.slice(0, KEY_PREFIX_TOKEN_LEN)}`);
  });

  it('is unpredictable — two keys differ', () => {
    expect(generateApiKey('live').fullKey).not.toBe(generateApiKey('live').fullKey);
  });

  it('encodes 32 random bytes as base62 (token is non-trivially long)', () => {
    const { fullKey } = generateApiKey('test');
    const token = fullKey.slice('gw_test_'.length);
    // 32 bytes of base62 is ~43 chars; assert it is clearly more than the prefix slice.
    expect(token.length).toBeGreaterThan(KEY_PREFIX_TOKEN_LEN);
    expect(token).toMatch(/^[0-9A-Za-z]+$/);
  });
});

describe('deriveKeyPrefix / parseKeyPrefix', () => {
  it('deriveKeyPrefix matches the generated prefix', () => {
    const { fullKey, keyPrefix } = generateApiKey('live');
    expect(deriveKeyPrefix(fullKey)).toBe(keyPrefix);
  });

  it('parseKeyPrefix returns the same prefix from a raw key', () => {
    const { fullKey, keyPrefix } = generateApiKey('test');
    expect(parseKeyPrefix(fullKey)).toBe(keyPrefix);
  });

  it('parseKeyPrefix returns null for malformed keys', () => {
    expect(parseKeyPrefix('')).toBeNull();
    expect(parseKeyPrefix('nope')).toBeNull();
    expect(parseKeyPrefix('gw_live_')).toBeNull();
    expect(parseKeyPrefix('xx_live_abcdef1234')).toBeNull();
  });
});

describe('parseKeyEnvironment', () => {
  it('extracts the env embedded in the key', () => {
    expect(parseKeyEnvironment(generateApiKey('live').fullKey)).toBe('live');
    expect(parseKeyEnvironment(generateApiKey('test').fullKey)).toBe('test');
  });

  it('returns null for malformed keys', () => {
    expect(parseKeyEnvironment('')).toBeNull();
    expect(parseKeyEnvironment('nope')).toBeNull();
    expect(parseKeyEnvironment('xx_live_abcdef1234')).toBeNull();
  });
});

describe('hashApiKey', () => {
  it('is deterministic for the same key + pepper', () => {
    const key = 'gw_live_abc123';
    expect(hashApiKey(key, 'pepper-1')).toBe(hashApiKey(key, 'pepper-1'));
  });

  it('differs across peppers (same key)', () => {
    const key = 'gw_live_abc123';
    expect(hashApiKey(key, 'pepper-1')).not.toBe(hashApiKey(key, 'pepper-2'));
  });

  it('differs across keys (same pepper)', () => {
    expect(hashApiKey('gw_live_a', 'p')).not.toBe(hashApiKey('gw_live_b', 'p'));
  });

  it('returns a 64-char lowercase hex string (HMAC-SHA256)', () => {
    expect(hashApiKey('gw_live_abc', 'pepper')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('safeCompareHex (constant-time compare)', () => {
  it('returns true for identical hashes', () => {
    const h = hashApiKey('gw_live_abc', 'pepper');
    expect(safeCompareHex(h, h)).toBe(true);
  });

  it('returns false for differing hashes of equal length', () => {
    const a = hashApiKey('gw_live_abc', 'pepper');
    const b = hashApiKey('gw_live_abd', 'pepper');
    expect(safeCompareHex(a, b)).toBe(false);
  });

  it('returns false (no throw) on length mismatch', () => {
    expect(safeCompareHex('aa', 'aabb')).toBe(false);
  });

  it('returns false on empty input', () => {
    expect(safeCompareHex('', '')).toBe(false);
  });
});
