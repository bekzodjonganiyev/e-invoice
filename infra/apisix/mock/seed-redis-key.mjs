#!/usr/bin/env node
/**
 * Seed one API key straight into Redis — exactly the shape the gateway's
 * bootstrap / Realtime sync writes (key:meta:{prefix} hash). Lets you test the
 * gateway auth path locally without provisioning a user + api_keys row in DB.
 *
 * Reads API_KEY_PEPPER + REDIS_URL from the environment (source apps/gateway/.env
 * first so the pepper MATCHES the gateway). Prints the full plaintext key.
 *
 *   set -a; . apps/gateway/.env; set +a
 *   node infra/apisix/mock/seed-redis-key.mjs [--monthly 1000] [--rate 60] \
 *        [--status active|revoked|expired] [--expires 2020-01-01T00:00:00Z]
 *
 * Import paths are absolute so it runs from anywhere.
 */
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { generateApiKey, hashApiKey, keyMeta } from '/home/bekzod/work/e-invoice/packages/shared/dist/index.js';

// ioredis is a gateway dependency (pnpm) — resolve it from apps/gateway so this
// script runs regardless of cwd / where node's ESM resolver starts.
const require = createRequire('/home/bekzod/work/e-invoice/apps/gateway/');
const Redis = require('ioredis');

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const PEPPER = process.env.API_KEY_PEPPER;
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
if (!PEPPER) {
  console.error('API_KEY_PEPPER not set — `set -a; . apps/gateway/.env; set +a` first.');
  process.exit(1);
}

const monthly = Number(arg('monthly', '1000'));
const rate = arg('rate', ''); // '' → no per-minute limit
const status = arg('status', 'active');
const expires = arg('expires', ''); // '' → never

const { fullKey, keyPrefix } = generateApiKey('live');
const keyHash = hashApiKey(fullKey, PEPPER);
// Real UUIDs so the id/user_id are well-formed (matches api_keys.id being uuid).
// NOTE: there is still no matching api_keys row in the DB, so the gateway's
// background usage flush to Supabase will FK-fail for keys seeded this way —
// that's expected for a Redis-only seed and does not affect the auth path.
// For a fully clean run, create keys via the portal (real DB row) instead.
const id = randomUUID();

// Mirror buildMetaHash() from apps/gateway/src/keys/key-meta.ts
const meta = {
  id,
  user_id: randomUUID(),
  key_hash: keyHash,
  monthly_limit: String(monthly),
  rate_limit_per_min: rate === '' ? '' : String(Number(rate)),
  status,
  environment: 'live',
  expires_at: expires,
};

const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
await redis.hset(keyMeta(keyPrefix), meta);
await redis.quit();

console.log(JSON.stringify({
  fullKey, keyPrefix, id,
  monthly_limit: monthly,
  rate_limit_per_min: rate === '' ? null : Number(rate),
  status, expires_at: expires || null,
}, null, 2));
console.error(`\n  seeded key:meta:${keyPrefix}  →  use header:  Authorization: Bearer ${fullKey}`);
