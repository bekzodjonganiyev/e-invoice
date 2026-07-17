# VPS deploy — portal + gateway

This stack ships **the two apps plus their own Redis**. APISIX already runs on
the VPS and is treated as pre-existing infrastructure; Mustang is the real
external upstream; the database is Supabase (cloud — nothing to run here).
`infra/` in this repo is the *local mock* stack — it is not used in production.

```
              ┌──────────────── VPS ──────────────────┐
 client ─────▶│ APISIX (docker, its own stack)        │─────▶ Mustang (external)
              │   │ forward-auth                      │
              │   ▼                                   │
              │ ┌──── this compose stack ─────┐       │
              │ │ gateway :4000 ──▶ redis:6379│       │──▶ Supabase (cloud)
              │ │ portal  :3000               │       │
              │ └─────────────────────────────┘       │
              │      ▲ 127.0.0.1:3000                 │
              │      └── reverse proxy / TLS          │
              └───────────────────────────────────────┘
```

The Redis in this stack is **ours alone**. Any Redis already running on the VPS
host is left untouched: our container never publishes a port to the host, so its
6379 and the host's 6379 are different, non-colliding things. Keyspaces stay
separate too, so nothing here can clash with another service's keys.

## 1. Prerequisites on the VPS

- Docker + Docker Compose v2
- APISIX already running in Docker
- This repo cloned (or the build context copied over)

Not needed: a database (Supabase is remote) or a host Redis (this stack brings
its own).

## 2. Configure

```bash
cp .env.example .env
$EDITOR .env    # fill every value
```

Two settings decide whether anything works at all:

- **`API_KEY_PEPPER`** must be identical for portal and gateway. Since both now
  read the same root `.env`, this is automatic — but if you ever split them,
  a mismatch makes every proxied call 403 with no useful error.
- **`GATEWAY_FORWARD_AUTH_SECRET`** must equal the value in the APISIX route
  (step 5). A mismatch makes the gateway reject APISIX itself.

> Historical gotcha: `infra/apisix/.env` once carried a 127-char pepper while
> portal/gateway used 64. Generate each secret once with `openssl rand -hex 32`
> and paste the same string everywhere it is required.

## 3. Redis

Nothing to configure — the stack runs its own Redis container and the gateway
reaches it at `redis://redis:6379`. Two properties are worth understanding, as
they are the reason this is simpler than reusing the host's Redis:

- **No port collision is possible.** The redis service declares no `ports:`, so
  it is never published to the host. Its 6379 lives in the container's own
  network namespace; whatever occupies 6379 on the VPS is irrelevant.
- **Not exposed to the internet**, for the same reason — no firewall rule needed.

Data lives in the `redis-data` named volume with AOF enabled, so counters and
the key cache survive restarts and rebuilds. `docker compose down` keeps it;
only `docker compose down -v` deletes it.

Verify after `up`:

```bash
docker compose exec redis redis-cli ping        # PONG
docker compose exec gateway node -e "
const R=require('ioredis'); const r=new R(process.env.REDIS_URL);
r.ping().then(x=>{console.log('gateway -> redis:',x);process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)})"
```

## 4. Find the APISIX network

The gateway joins APISIX's existing Docker network so APISIX can reach it as
`http://gateway:4000`. Find its real name:

```bash
docker network ls
```

Set `APISIX_NETWORK` in `.env` to that name (default assumed: `apisix_default`).

## 5. Bring it up

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f gateway
```

Confirm APISIX can see the gateway:

```bash
docker compose exec gateway node -e "fetch('http://127.0.0.1:4000/health').then(r=>r.text()).then(console.log)"
# from the APISIX container:
docker exec <apisix-container> curl -s http://gateway:4000/health   # {"status":"ok"}
```

## 6. Configure the APISIX route (Admin API)

This is the same flow encoded in `infra/apisix/apisix.tpl.yaml`, translated to
the Admin API. Requires APISIX running with etcd — in standalone mode the Admin
API is disabled and you edit `apisix.yaml` instead.

```bash
ADMIN=http://127.0.0.1:9180
KEY=<your APISIX admin api key>
SECRET=<the same GATEWAY_FORWARD_AUTH_SECRET as in .env>

# upstream → Mustang
curl -s "$ADMIN/apisix/admin/upstreams/mustang" -H "X-API-KEY: $KEY" -X PUT -d '{
  "name": "mustang-einvoice",
  "type": "roundrobin",
  "scheme": "https",
  "pass_host": "node",
  "nodes": { "einvoiceservice.officefreund.de:443": 1 },
  "timeout": { "connect": 10, "send": 60, "read": 60 }
}'

# route → inject secret, forward-auth, strip secret, proxy
curl -s "$ADMIN/apisix/admin/routes/mustang-proxy" -H "X-API-KEY: $KEY" -X PUT -d '{
  "name": "mustang-proxy",
  "uris": ["/*"],
  "upstream_id": "mustang",
  "plugins": {
    "proxy-rewrite": {
      "headers": { "set": { "X-Gateway-Secret": "'"$SECRET"'" } }
    },
    "forward-auth": {
      "uri": "http://gateway:4000/auth",
      "request_method": "GET",
      "request_headers": ["Authorization", "apikey", "X-Gateway-Secret", "X-Request-Id"],
      "upstream_headers": ["X-User-Id", "X-Api-Key-Id"],
      "client_headers": ["WWW-Authenticate"],
      "ssl_verify": false,
      "timeout": 3000,
      "allow_degradation": false,
      "status_on_error": 503
    },
    "serverless-pre-function": {
      "phase": "before_proxy",
      "functions": ["return function(conf, ctx) local core = require(\"apisix.core\"); core.request.set_header(ctx, \"X-Gateway-Secret\", nil) end"]
    }
  }
}'
```

Why each piece matters:

- `proxy-rewrite` proves to the gateway that the call came from APISIX.
- `forward-auth` with `allow_degradation: false` **fails closed** — if the
  gateway is down, traffic is denied (503) rather than passed through
  unauthenticated.
- `serverless-pre-function` strips the internal secret *before* proxying, so it
  never leaks to the third-party Mustang service.

## 7. Portal TLS

The portal is published on `127.0.0.1:3000` only. Terminate TLS for its domain
in your host reverse proxy and forward to that port. Add the portal's public
URL to Supabase → Auth → URL Configuration (Site URL + redirect allowlist), or
Google OAuth callbacks will fail in production.

## 8. Verify end to end

```bash
# 1. no key → 401, and Mustang is never reached
curl -i https://<api-domain>/some/path

# 2. real key from the portal → proxied through
curl -i https://<api-domain>/some/path -H "Authorization: Bearer gw_live_xxx"
```

Then check the portal's Usage page — the call should appear. That exercises the
whole chain: APISIX → gateway → Redis → Supabase → Mustang.

## 9. Updating

```bash
git pull
docker compose up -d --build
```

Remember: changing `NEXT_PUBLIC_*` requires a portal **rebuild**, not a restart —
Next inlines those values into the client bundle at build time.
