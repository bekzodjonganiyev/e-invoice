# Local mock-APISIX — full-cycle test runbook

Bu papka APISIX'ni **lokalда mock** qilib, real gateway'ni to'liq zanjir bo'yicha
sinash uchun. Real APISIX/docker kerak emas — faqat Node + Redis.

```
curl (client) ──▶ mock-apisix.mjs (:9080) ──forward-auth──▶ gateway (:4000) ──▶ Redis + Supabase
                        │  allow → identity inject + secret strip
                        └──────────────────────────────────────▶ mock-mustang.mjs (:9081)
```

| Fayl | Vazifa |
|------|--------|
| `mock-apisix.mjs` | APISIX forward-auth route'ining aniq nusxasi (secret inject → `/auth` → deny relay yoki upstream'ga proxy → secret strip) |
| `mock-mustang.mjs` | Soxta upstream — qabul qilgan identity header'larni echo qiladi |
| `seed-redis-key.mjs` | Redis'ga to'g'ridan-to'g'ri key seed qiladi (portalсиз tez sinash uchun) |

---

## 0. Tayyorgarlik (bir marta)

```bash
cd /home/bekzod/work/e-invoice

# Redis ishlab turibdimi?
redis-cli ping                     # → PONG bo'lishi kerak

# .env fayllar to'ldirilgan bo'lsin: apps/gateway/.env, apps/portal/.env.local
# Peppers mos ekanini tekshiring (portal == gateway shart):
diff <(grep API_KEY_PEPPER apps/gateway/.env) <(grep API_KEY_PEPPER apps/portal/.env.local) \
  && echo "pepper MOS ✅" || echo "pepper FARQ ❌ — tuzating"

# Build (shared + db + gateway)
pnpm --filter @gw/shared --filter @gw/db --filter @gw/gateway build
```

> **Muhim:** gateway `.env`ни avtomatik yuklamaydi. Har safar ishga tushirishдан oldin
> `set -a; . apps/gateway/.env; set +a` bilan qo'lда yuklang.

---

## Terminal joylashuvi

To'rt terminal ochish qulay (yoki `&` bilan fonда). Repo ildizidан:

### Terminal 1 — Gateway (real Redis + real Supabase)
```bash
cd /home/bekzod/work/e-invoice/apps/gateway
set -a; . ./.env; set +a
node dist/main.js
# Kutiladi: "Seeded N active key(s)" → "listening on :4000"
# (birinchi boot ~15s olishi mumkin — Supabase'ga ulanadi)
```

### Terminal 2 — Mock Mustang (upstream)
```bash
cd /home/bekzod/work/e-invoice
PORT=9081 node infra/apisix/mock/mock-mustang.mjs
```

### Terminal 3 — Mock APISIX (edge)
```bash
cd /home/bekzod/work/e-invoice
set -a; . apps/gateway/.env; set +a      # GATEWAY_FORWARD_AUTH_SECRET kerak
LISTEN_PORT=9080 \
GATEWAY_AUTH_URL=http://127.0.0.1:4000/auth \
UPSTREAM_URL=http://127.0.0.1:9081 \
node infra/apisix/mock/mock-apisix.mjs
```

### Terminal 4 — bu yerдан test buyruqlarini yuborasiz.

---

## Yo'l A — Tez sinash (portalсиз, Redis'ga to'g'ridan-to'g'ri seed)

Key'ni Redis'ga o'zi yozadi (DB kerak emas). Bir nechta stsenariy seed qiling:

```bash
cd /home/bekzod/work/e-invoice
set -a; . apps/gateway/.env; set +a

# har biri to'liq key'ni JSON qaytaradi (fullKey maydonini oling):
node infra/apisix/mock/seed-redis-key.mjs --monthly 1000                 # oddiy
node infra/apisix/mock/seed-redis-key.mjs --monthly 1000 --rate 1        # rate-limit
node infra/apisix/mock/seed-redis-key.mjs --monthly 1                    # kvota
node infra/apisix/mock/seed-redis-key.mjs --status revoked               # revoked
node infra/apisix/mock/seed-redis-key.mjs --expires 2020-01-01T00:00:00Z # expired
```

Chiqqan `fullKey`'ни olib, mock APISIX orqali chaqiring:

```bash
KEY="gw_live_...."     # yuqoridagi chiqishдан

# 1) OK → 200, Mustang'ga yetadi
curl -i http://127.0.0.1:9080/v1/documents \
  -X POST -H "Authorization: Bearer $KEY" -d '{"invoice":1}'

# 2) Key yo'q → 401
curl -i http://127.0.0.1:9080/v1/documents

# 3) Noto'g'ri key → 401
curl -i http://127.0.0.1:9080/v1/documents -H "Authorization: Bearer gw_live_wrong000000"
```

> ⚠️ Yo'l A'да seed qilingan key'ning DB'да `api_keys` qatori yo'q, shuning uchun
> gateway'ning fondаги usage flush'i Supabase'га FK xato beradi (har 5s). Bu
> **auth yo'liга ta'sir qilmaydi** — faqat log shovqini. Toza sinov uchun Yo'l B.

---

## Yo'l B — To'liq cikл (portal → DB → gateway → APISIX → usage)

Bu haqiqiy uchdan-uchiga. Real DB'ga yozadi.

**1. Portalни ishga tushiring (5-terminal yoki fonда):**
```bash
cd /home/bekzod/work/e-invoice/apps/portal
pnpm dev        # http://localhost:3000
```

**2. Brauzerда:**
- `http://localhost:3000/login` → **Sign in with Google** → dashboard.
- **API Keys → Create key** → Label bering → **Create**.
- Chiqqan `gw_live_...` to'liq key'ni **darrov nusxa oling** (faqat bir marta ko'rsatiladi).

**3. Gateway'ни qayta ishga tushiring** (Terminal 1'da Ctrl-C → qayta `node dist/main.js`).
Boot'да bootstrap yangi key'ni Supabase'дан Redis'ga oladi:
```
Seeded 1 active key(s) into Redis
```
> Yoki gateway'ni to'xtatмасдан kutib turing — Realtime sync ham key'ni oladi (`KeysService`).
> Ishonch uchun restart eng oddiy.

**4. Redis'да paydo bo'lganini tekshiring:**
```bash
redis-cli --scan --pattern 'key:meta:*'
```

**5. Key bilan chaqiring (Terminal 4):**
```bash
KEY="gw_live_...."      # portalдан nusxalangan
curl -s http://127.0.0.1:9080/v1/documents \
  -X POST -H "Authorization: Bearer $KEY" -d '{"invoice":"INV-001"}' | head -20
# 2-3 marta takrorlang — usage oshadi
curl -i http://127.0.0.1:9080/v1/status -H "Authorization: Bearer $KEY"
```

**6. Natijani tasdiqlang:**
```bash
# Redis'даги hisoblagich (YYYY-MM joriy oy)
redis-cli keys 'usage:*:2026-07'
redis-cli get 'usage:<api_key_id>:2026-07'

# Gateway logида (~5s ичida): "Flushed N usage event(s)" — Supabase'ga yozildi
```
- Brauzerда **API Keys** yoki **Dashboard** sahifasini yangilang → **USAGE 3 / 10,000** ko'rinadi.
- Bu usage Redis'дан real Supabase `usage_events` + `api_keys.current_usage`'га flush bo'lgani belgisi.

---

## Kutilgan natijalar jadvali

| So'rov | Kutilgan status | Mustang'ga bordimi? |
|--------|-----------------|---------------------|
| Valid key | 200 | Ha — `X-User-Id`/`X-Api-Key-Id` bilan, `X-Gateway-Secret`сиз |
| Key yo'q | 401 | Yo'q |
| Noto'g'ri/notanish key | 401 | Yo'q |
| Revoked key | 401 | Yo'q |
| Expired key | 403 | Yo'q |
| Rate-limit oshgan | 429 | Yo'q |
| Kvota tugagan | 429 | Yo'q |

`mock-apisix.mjs` va `mock-mustang.mjs` terminallaridа har bir qaror (ALLOW/DENY) va
`secretLeaked=false` log qilinadi.

---

## Avtomatik variant (jest — hech qanday process ko'tarmaсдан)

Xuddi shu zanjir avtomatik testда ham bor (ioredis-mock + stub Supabase):
```bash
pnpm --filter @gw/gateway exec jest --config ./test/jest-e2e.json apisix-proxy
```

---

## Tozalash

```bash
# Processlarni to'xtatish: har terminalда Ctrl-C, yoki:
pkill -f mock-apisix.mjs; pkill -f mock-mustang.mjs; pkill -f 'node dist/main.js'; pkill -f 'next dev'

# Redis'даги sinov ma'lumotlari (Yo'l A key'lari):
redis-cli --scan --pattern 'key:meta:*'   | xargs -r redis-cli del
redis-cli --scan --pattern 'usage:*'      | xargs -r redis-cli del
redis-cli --scan --pattern 'ratelimit:*'  | xargs -r redis-cli del
redis-cli del usage:queue key:status:queue

# Portalда yaratilgan sinov key'ini "Revoke" tugmasi bilan bekor qiling.
```

---

## Muammolar

| Belgi | Sabab | Yechim |
|-------|-------|--------|
| gateway `Missing required environment variable` | `.env` yuklanmagan | `set -a; . ./.env; set +a` |
| gateway boot'да osilib qoldi | birinchi Supabase ulanishi sekin | ~15s kuting; keyin `listening on :4000` |
| barcha key 401 | portal/gateway `API_KEY_PEPPER` farq | ikkovини bir xil qiling |
| mock-apisix `503` | gateway (:4000) ishlamayapti | Terminal 1'ни tekshiring |
| `Usage flush failed: invalid uuid` | Yo'l A key'i (DB'да qatori yo'q) | e'tibormang, yoki Yo'l B ishlating |
| portalда usage 0 | flush hali bo'lmagan | ~5s kuting, sahifani yangilang |
