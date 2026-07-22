#!/usr/bin/env node
/**
 * Apply infra/apisix/services.json to a live APISIX (etcd / Admin API mode).
 * Idempotent: every object is PUT by its fixed `id`, so re-running after
 * editing services.json converges the server to match the file — nobody
 * needs to hand-run curl commands anymore (see mustang-gateway-docs-sandbox-qarorlar.md §6).
 *
 * The forward-auth plugin chain (proxy-rewrite → forward-auth → strip) is
 * defined ONCE here, not in services.json, and merged onto every service —
 * it is identical for prod and test (only the upstream differs), so keeping
 * it in code avoids duplicating it per service in the data file.
 *
 * Usage:
 *   export ADMIN=http://127.0.0.1:9180
 *   export KEY=<APISIX admin key>               # config.yaml -> deployment.admin.admin_key
 *   export SECRET=<GATEWAY_FORWARD_AUTH_SECRET>  # same value as the gateway .env
 *   node sync-apisix.mjs
 *
 *   node sync-apisix.mjs --dry-run   # print what would be sent, make no calls
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DRY_RUN = process.argv.includes('--dry-run');

const ADMIN = requireEnv('ADMIN', 'e.g. export ADMIN=http://127.0.0.1:9180');
const KEY = requireEnv('KEY', 'the APISIX admin key');
const SECRET = requireEnv('SECRET', 'GATEWAY_FORWARD_AUTH_SECRET');

function requireEnv(name, hint) {
  if (DRY_RUN) return process.env[name] ?? `<${name}>`;
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var ${name} (${hint})`);
    process.exit(1);
  }
  return v;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(__dirname, 'services.json'), 'utf8'));

/** The forward-auth chain reused by every service, identically. */
function forwardAuthChain() {
  return {
    'proxy-rewrite': {
      headers: { set: { 'X-Gateway-Secret': SECRET } },
    },
    'forward-auth': {
      uri: 'http://gateway:4000/auth',
      request_method: 'GET',
      request_headers: ['Authorization', 'apikey', 'X-Gateway-Secret', 'X-Request-Id'],
      upstream_headers: ['X-User-Id', 'X-Api-Key-Id'],
      client_headers: ['WWW-Authenticate'],
      ssl_verify: false,
      timeout: 3000,
      allow_degradation: false,
      status_on_error: 503,
    },
    'serverless-pre-function': {
      phase: 'before_proxy',
      functions: [
        'return function(conf, ctx) local core = require("apisix.core"); core.request.set_header(ctx, "X-Gateway-Secret", nil) end',
      ],
    },
  };
}

async function put(path, body, label) {
  if (DRY_RUN) {
    console.log(`[dry-run] PUT ${path}`);
    console.log(JSON.stringify(body, null, 2));
    return;
  }
  const res = await fetch(`${ADMIN}${path}`, {
    method: 'PUT',
    headers: { 'X-API-KEY': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${label} failed: ${res.status} ${text}`);
  }
  console.log(`  ok  ${label}`);
}

async function main() {
  console.log('==> upstreams');
  for (const u of config.upstreams) {
    const { id, ...body } = u;
    await put(`/apisix/admin/upstreams/${id}`, body, `upstream ${id}`);
  }

  console.log('==> services');
  for (const s of config.services) {
    const { id, extraPlugins, ...rest } = s;
    const body = {
      ...rest,
      plugins: { ...forwardAuthChain(), ...(extraPlugins ?? {}) },
    };
    await put(`/apisix/admin/services/${id}`, body, `service ${id}`);
  }

  console.log('==> routes');
  for (const r of config.routes) {
    const { id, ...body } = r;
    await put(`/apisix/admin/routes/${id}`, body, `route ${id}`);
  }

  console.log(
    `\n==> done. ${config.upstreams.length} upstream(s), ${config.services.length} service(s), ${config.routes.length} route(s) synced from services.json.`,
  );
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
