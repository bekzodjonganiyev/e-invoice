import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type KeyEnvironment = 'live' | 'test';

/** Number of token characters retained in the (public) key_prefix. */
export const KEY_PREFIX_TOKEN_LEN = 6;

/** Random bytes of entropy behind each key's token. */
export const KEY_TOKEN_BYTES = 32;

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** Encode a byte buffer as a base62 string (big-endian). */
export function base62Encode(buf: Buffer): string {
  // Interpret the buffer as a big integer, then repeatedly divmod by 62.
  let num = 0n;
  for (const byte of buf) {
    num = (num << 8n) + BigInt(byte);
  }
  if (num === 0n) return '0';
  let out = '';
  const base = 62n;
  while (num > 0n) {
    const rem = Number(num % base);
    out = BASE62[rem] + out;
    num = num / base;
  }
  return out;
}

export interface GeneratedApiKey {
  /** Full plaintext key — shown to the user exactly once, never stored. */
  fullKey: string;
  /** Public prefix stored in the DB and shown in listings. */
  keyPrefix: string;
  /** The random token portion (after gw_{env}_). */
  token: string;
}

/**
 * Generate a fresh API key: `gw_{env}_{token}` where token is base62 of 32 random bytes.
 * key_prefix = `gw_{env}_` + first 6 chars of token.
 */
export function generateApiKey(env: KeyEnvironment): GeneratedApiKey {
  const token = base62Encode(randomBytes(KEY_TOKEN_BYTES));
  const fullKey = `gw_${env}_${token}`;
  const keyPrefix = `gw_${env}_${token.slice(0, KEY_PREFIX_TOKEN_LEN)}`;
  return { fullKey, keyPrefix, token };
}

const KEY_RE = /^gw_(live|test)_([0-9A-Za-z]+)$/;

/**
 * Derive the public key_prefix from a full key. Throws on a malformed key —
 * use {@link parseKeyPrefix} for a non-throwing variant.
 */
export function deriveKeyPrefix(fullKey: string): string {
  const prefix = parseKeyPrefix(fullKey);
  if (prefix === null) {
    throw new Error('Malformed API key');
  }
  return prefix;
}

/**
 * Parse the public key_prefix from a full key, or null if the key is malformed.
 * A valid prefix requires at least KEY_PREFIX_TOKEN_LEN token characters.
 */
export function parseKeyPrefix(fullKey: string): string | null {
  const m = KEY_RE.exec(fullKey ?? '');
  if (!m) return null;
  const env = m[1];
  const token = m[2];
  if (token.length < KEY_PREFIX_TOKEN_LEN) return null;
  return `gw_${env}_${token.slice(0, KEY_PREFIX_TOKEN_LEN)}`;
}

/**
 * HMAC-SHA256(fullKey, pepper) hex. Deterministic given the same pepper.
 * The SAME pepper must be configured in Portal and Gateway so hashes match.
 */
export function hashApiKey(fullKey: string, pepper: string): string {
  return createHmac('sha256', pepper).update(fullKey).digest('hex');
}

/**
 * Constant-time comparison of two hex-encoded hashes. Returns false on any
 * length mismatch without leaking timing information.
 */
export function safeCompareHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}
