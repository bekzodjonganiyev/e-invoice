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

You already have APISIX running. Two ways to install this route:

**A. Standalone (file) mode** — copy `config.yaml` + the rendered `apisix.yaml`
(run `entrypoint.sh`'s sed step, or substitute the secret yourself) into
`/usr/local/apisix/conf/` and reload APISIX.

**B. Admin API mode (etcd)** — create the upstream and route via the Admin API.
Equivalent to `apisix.tpl.yaml`:

```bash
# Upstream → Mustang
curl http://127.0.0.1:9180/apisix/admin/upstreams/mustang -H "X-API-KEY: $ADMIN_KEY" -X PUT -d '{
  "type":"roundrobin","scheme":"https","pass_host":"node",
  "nodes":{"einvoiceservice.officefreund.de:443":1}
}'

# Route → forward-auth + secret inject + secret strip
curl http://127.0.0.1:9180/apisix/admin/routes/mustang-proxy -H "X-API-KEY: $ADMIN_KEY" -X PUT -d '{
  "uri":"/*","upstream_id":"mustang",
  "plugins":{
    "proxy-rewrite":{"headers":{"set":{"X-Gateway-Secret":"'"$GATEWAY_FORWARD_AUTH_SECRET"'"}}},
    "forward-auth":{
      "uri":"http://GATEWAY_HOST:4000/auth","request_method":"GET",
      "request_headers":["Authorization","apikey","X-Gateway-Secret","X-Request-Id"],
      "upstream_headers":["X-User-Id","X-Api-Key-Id"],
      "ssl_verify":false,"status_on_error":503
    },
    "serverless-pre-function":{"phase":"before_proxy","functions":[
      "return function(conf, ctx) local core = require(\"apisix.core\"); core.request.set_header(ctx, \"X-Gateway-Secret\", nil) end"
    ]}
  }
}'
```

Make sure `proxy-rewrite`, `forward-auth`, and `serverless-pre-function` are in
your APISIX `plugins` list, and that the gateway is reachable on the private
network but **not** publicly (only APISIX should be able to call `/auth`).

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
