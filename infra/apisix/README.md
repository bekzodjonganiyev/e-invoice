# APISIX edge — e-invoice gateway

APISIX is the public edge. Every request to the Mustang e-invoice service goes
through one route that calls the NestJS gateway's `/auth` (forward-auth) and only
proceeds to Mustang when the API key is valid, within its rate limit, and within
its monthly quota.

```
client ──▶ APISIX ──forward-auth──▶ gateway /auth ──▶ Redis (key meta, counters)
              │  allow (200 + X-User-Id, X-Api-Key-Id)
              └──────────────────────────────────────▶ Mustang (einvoiceservice.officefreund.de)
              │  deny (401 / 403 / 429)
              └──▶ relayed straight back to the client (Mustang never touched)
```

## Files

| File | Purpose |
|------|---------|
| `apisix.tpl.yaml` | Declarative routes + upstream. `__GATEWAY_FORWARD_AUTH_SECRET__` is rendered at start. |
| `config.yaml` | APISIX standalone (no-etcd) deployment config; enables only the 3 plugins used. |
| `entrypoint.sh` | Renders the secret into `apisix.yaml`, then starts APISIX. |
| `docker-compose.yml` | Local stack: apisix + gateway + redis. |
| `.env.example` | Secrets for the local stack. Copy to `.env`. |

## How the route works (plugin by plugin)

1. **`proxy-rewrite`** (rewrite phase) injects `X-Gateway-Secret` — the shared
   secret that proves the call came from APISIX, not a client hitting `/auth`
   directly. The value is rendered from `$GATEWAY_FORWARD_AUTH_SECRET` at start,
   so it is never committed.
2. **`forward-auth`** (access phase) does a `GET` to `http://gateway:4000/auth`,
   forwarding `Authorization`, `apikey`, `X-Gateway-Secret`, `X-Request-Id`.
   APISIX auto-adds `X-Forwarded-Method`, `X-Forwarded-Uri`, `X-Forwarded-Proto`,
   `X-Forwarded-Host`, `X-Forwarded-For`.
   - **2xx** → allow. `upstream_headers` copies `X-User-Id` / `X-Api-Key-Id` from
     the auth response onto the upstream request so Mustang knows who is calling.
   - **401 / 403 / 429** → APISIX relays that status (and body) to the client;
     Mustang is never reached.
   - **gateway down** → `status_on_error: 503`, `allow_degradation: false` → fail
     **closed** (deny), never let unauthenticated traffic through.
3. **`serverless-pre-function`** (before_proxy phase) strips `X-Gateway-Secret`
   so the internal secret is **not** leaked to the third-party Mustang upstream.

## Run the full stack locally

```bash
cd infra/apisix
cp .env.example .env          # fill GATEWAY_FORWARD_AUTH_SECRET, SUPABASE_*, API_KEY_PEPPER
docker compose up --build
# APISIX on :9080 → gateway :4000 → redis :6379

# a real key created in the portal (or seeded into Redis) then:
curl -i http://localhost:9080/v1/documents \
  -H "Authorization: Bearer gw_live_xxxxx"
```

> The gateway container needs `apps/gateway/Dockerfile` (not included yet). Until
> then, run the gateway with `pnpm --filter @gw/gateway dev` on the host and point
> `forward-auth.uri` at `http://host.docker.internal:4000/auth`.

## Deploying onto an already-running APISIX server

You already have APISIX running (this is the VPS case — see the repo's
`DEPLOY.md`). Two ways to install the Mustang proxy:

**A. Standalone (file) mode** — copy `config.yaml` + the rendered `apisix.yaml`
(run `entrypoint.sh`'s sed step, or substitute the secret yourself) into
`/usr/local/apisix/conf/` and reload APISIX.

**B. Admin API mode (etcd)** — this is the VPS's actual mode. Don't hand-write
`curl` calls: [`services.json`](services.json) declares two upstreams (real
Mustang for `live` calls, the `mustang-mock` container for `test` calls), two
services (`mustang-mock-prod` / `mustang-mock-test` — same forward-auth chain,
sandbox-only `cors` + `limit-count` on the test one), and two wildcard routes
on `/api/v1.8.2/*` that pick a service by the caller's key prefix. Apply it
with [`sync-apisix.mjs`](sync-apisix.mjs) (plain Node, no dependencies,
idempotent — safe to re-run after any edit to `services.json`):

```bash
export ADMIN=http://127.0.0.1:9180
export KEY=<APISIX admin key>                 # config.yaml -> deployment.admin.admin_key
export SECRET=<GATEWAY_FORWARD_AUTH_SECRET>   # same value as the gateway .env

node sync-apisix.mjs --dry-run   # review the exact payloads first
node sync-apisix.mjs             # apply
```

Make sure `proxy-rewrite`, `forward-auth`, `serverless-pre-function`, `cors`,
and `limit-count` are all in your APISIX `plugins` list, and that the gateway
is reachable on the private network but **not** publicly (only APISIX should
be able to call `/auth`). See `mustang-gateway-docs-sandbox-qarorlar.md` at the
repo root for the design rationale (why two services instead of 22+ routes,
why the environment split is routing-only and not a security boundary).

## Verifying the contract BEFORE deploying

The forward-auth contract is proven end-to-end without needing APISIX itself:

```bash
pnpm --filter @gw/gateway exec jest --config ./test/jest-e2e.json apisix-proxy
```

`apps/gateway/test/apisix-proxy.e2e-spec.ts` mocks APISIX (a faithful port of
this route: inject secret → forward-auth → relay-deny or proxy-with-identity →
strip secret) and drives the **real** gateway over real HTTP against a mock
Mustang upstream. It asserts:

- valid key → Mustang receives the request **with** `X-User-Id`/`X-Api-Key-Id`
  and **without** `X-Gateway-Secret`;
- missing / unknown / revoked (401), expired (403), rate-limited (429),
  quota-exhausted (429) → Mustang is **never** reached and the status is relayed.
