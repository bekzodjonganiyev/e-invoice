# Setup roadmap — Supabase env + Google OAuth

Bu qo'llanma noldan ishga tushirish uchun: barcha Supabase env qiymatlarini **qayerdan olish**, qaysi **URL**larni sozlash, va **Google auth** uchun nima qilish kerakligini bosqichma-bosqich beradi.

Tizimda **ikki xil auth** bor — ularni aralashtirmang:

| Plane | Kim | Qanday | Sozlash |
|-------|-----|--------|---------|
| **A. Human auth** | Portal foydalanuvchisi | Google OAuth (Supabase orqali) | Bu hujjat |
| **B. API auth** | Mustang'ga so'rov yuboruvchi | `gw_live_...` API key → APISIX → gateway `/auth` | Key portalda yaratiladi; `infra/apisix/` |

---

## Bosqich 1 — Supabase project yaratish

1. https://supabase.com → **New project**.
2. Project name, **database password** (saqlab qo'ying), region (foydalanuvchilarga yaqin) tanlang.
3. Project tayyor bo'lgach, **project ref** paydo bo'ladi — masalan `abcdefghijklmnop`. Sizning barcha URL'laringiz `https://<ref>.supabase.co` ko'rinishida bo'ladi.

---

## Bosqich 2 — Supabase env qiymatlarini olish

Dashboard'da: **Project Settings** (chapdagi ⚙️) ochiladi.

### 2.1 Project URL
**Settings → API → Project URL**
```
https://<ref>.supabase.co
```
Bu qiymat ikki joyda ishlatiladi: `NEXT_PUBLIC_SUPABASE_URL` (portal) va `SUPABASE_URL` (gateway).

### 2.2 API keys (yangi format)
**Settings → API Keys** (yoki **API → Project API keys**). Ikki kalit kerak:

| Supabase'dagi nomi | Format | Env var | Qayerda ishlatiladi |
|--------------------|--------|---------|---------------------|
| **Publishable key** (`anon`) | `sb_publishable_...` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Brauzerga boradi — **RLS himoya qiladi**, xavfsiz |
| **Secret key** (`service_role`) | `sb_secret_...` | `SUPABASE_SERVICE_ROLE_KEY` | **FAQAT server** — RLS'ni chetlab o'tadi, hech qachon brauzerga chiqmasin |

> ⚠️ `sb_secret_...` kaliti RLS'ni butunlay chetlab o'tadi. Uni faqat gateway va portalning server tomonida saqlang. Portalda u `env.server.ts` orqali `server-only` bilan himoyalangan — client component'dan import qilinsa build yiqiladi.

### 2.3 (Ixtiyoriy) DB connection string — faqat migration uchun
**Settings → Database → Connection string → URI**
```
postgresql://postgres:[YOUR-PASSWORD]@db.<ref>.supabase.co:5432/postgres
```
Bu `SUPABASE_DB_URL` — runtime'da kerak emas, faqat migration'ni CLI orqali qo'llash uchun.

---

## Bosqich 3 — DB migration'ni qo'llash

Schema `packages/db/migrations/0001_init.sql` da (jadvallar, RLS, `handle_new_user` trigger, `active_keys_bootstrap` view, realtime publication).

**Eng oson yo'l:** Dashboard → **SQL Editor** → New query → `0001_init.sql` mazmunini paste → **Run**.

CLI orqali (agar `supabase` o'rnatilgan bo'lsa):
```bash
psql "$SUPABASE_DB_URL" -f packages/db/migrations/0001_init.sql
```

Tekshiruv: **Table Editor**'da `profiles`, `api_keys`, `usage_events`, `billing_records` ko'rinishi kerak. **Database → Publications → supabase_realtime**'da `api_keys` bo'lishi kerak.

---

## Bosqich 4 — Umumiy secret'larni generatsiya qilish

Ikkita secret bir nechta servisда **bir xil** bo'lishi shart:

```bash
openssl rand -hex 32     # API_KEY_PEPPER uchun
openssl rand -hex 32     # GATEWAY_FORWARD_AUTH_SECRET uchun
```

| Secret | Bir xil bo'lishi kerak | Nima uchun |
|--------|------------------------|------------|
| `API_KEY_PEPPER` | Portal **va** Gateway | Portal key'ni shu pepper bilan hash qiladi; Gateway o'shani qayta hisoblab solishtiradi. Farq qilsa — har bir key noto'g'ri deб topiladi. |
| `GATEWAY_FORWARD_AUTH_SECRET` | Gateway **va** APISIX | APISIX `/auth`ga shu secret bilan murojaat qiladi; Gateway faqat shu secret'li so'rovni qabul qiladi. |

> Bu ikki qiymatni bir marta generatsiya qilib, quyidagi fayllarga bir xil ko'chiring. **Hech qachon git'ga commit qilmang** (`.env*` allaqachon `.gitignore`'da).

---

## Bosqich 5 — Env fayllarni to'ldirish

Uch fayl bor. To'liq manba `/.env.example` da — quyida qisqacha:

### `apps/portal/.env.local`
```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxx      # 2.2 publishable
SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxx               # 2.2 secret — server only
API_KEY_PEPPER=<openssl rand -hex 32>                 # gateway bilan bir xil
```

### `apps/gateway/.env`
```dotenv
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxx               # xuddi shu secret
REDIS_URL=redis://localhost:6379
API_KEY_PEPPER=<same as portal>                       # portal bilan bir xil
GATEWAY_FORWARD_AUTH_SECRET=<openssl rand -hex 32>    # APISIX bilan bir xil
PORT=4000
```

### `infra/apisix/.env`
```dotenv
GATEWAY_FORWARD_AUTH_SECRET=<same as gateway>         # gateway bilan bir xil
SUPABASE_URL=https://<ref>.supabase.co                # local stack gateway'ga uzatadi
SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxx
API_KEY_PEPPER=<same as portal/gateway>
```

**Env matritsasi (kim qayerdan oladi, qayerda bir xil bo'lishi kerak):**

| Var | Portal | Gateway | APISIX | Manba | Bir xil? |
|-----|:------:|:-------:|:------:|-------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL` | ✅ | ✅ | ✅ | Settings → API → Project URL | — |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | — | — | Settings → API Keys → publishable | — |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | ✅ | ✅ | Settings → API Keys → secret | — |
| `API_KEY_PEPPER` | ✅ | ✅ | ✅ | `openssl rand -hex 32` | 🔗 hammasi bir xil |
| `GATEWAY_FORWARD_AUTH_SECRET` | — | ✅ | ✅ | `openssl rand -hex 32` | 🔗 gateway=apisix |
| `REDIS_URL` | — | ✅ | (compose ичida) | O'zingiz | — |

---

## Bosqich 6 — Google OAuth (Google Cloud Console)

> Google Client ID + Secret **appda emas**, faqat **Supabase Dashboard**'da saqlanadi.

1. https://console.cloud.google.com → yuqoridan **project yaratish** (yoki mavjudini tanlash).
2. **APIs & Services → OAuth consent screen**:
   - User type: **External** → Create.
   - App name, **User support email**, Developer contact email to'ldiring.
   - Scopes: `.../auth/userinfo.email`, `.../auth/userinfo.profile`, `openid` (default'lar yetarli).
   - Test bosqichida: **Test users**'ga o'z Gmail'ingizni qo'shing (yoki keyin **Publish app**).
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized JavaScript origins**:
     ```
     http://localhost:3000
     https://<prod-portal-domain>        # productionda
     ```
   - **Authorized redirect URIs** — bu yerga **Supabase'ning callback**'ini yozing (appning emas!):
     ```
     https://<ref>.supabase.co/auth/v1/callback
     ```
   - Create → **Client ID** va **Client secret** paydo bo'ladi. Ularni ko'chiring.

> Oqim shunday: Google → **Supabase** `/auth/v1/callback` → Supabase sessiya yaratadi → appning `/auth/callback`'iga qaytaradi. Shu sabab Google'da Supabase URL turadi, app URL emas.

---

## Bosqich 7 — Supabase'da Google provider'ni yoqish

1. Dashboard → **Authentication → Providers → Google** → **Enable**.
2. **Client ID** va **Client Secret** (Bosqich 6) ni paste → **Save**.
3. Dashboard → **Authentication → URL Configuration**:
   - **Site URL**: `http://localhost:3000` (dev) yoki prod domen.
   - **Redirect URLs** (allowlist) — appning callback'ini qo'shing:
     ```
     http://localhost:3000/auth/callback
     https://<prod-portal-domain>/auth/callback
     ```
   Bu allowlist bo'lmasa, Supabase login'dan keyin appga qaytmaydi.

---

## Bosqich 8 — Tekshirish

```bash
# 1. Build/typecheck/test — hammasi yashil bo'lishi kerak
pnpm build && pnpm typecheck && pnpm test

# 2. Portal'ni ishga tushiring
pnpm --filter @gw/portal dev      # http://localhost:3000

# 3. Brauzerda:
#    /login → "Sign in with Google" → Google consent → /dashboard'ga qaytadi.
#    Supabase → Authentication → Users'da yangi user, Table Editor → profiles'da qatori paydo bo'ladi.

# 4. API zanjiri (APISIX'siz ham isbotlanadi):
pnpm --filter @gw/gateway exec jest --config ./test/jest-e2e.json apisix-proxy

# 5. Client bundle secret sizdirmasligini tasdiqlash
pnpm --filter @gw/portal build && pnpm --filter @gw/portal test:bundle
```

Oqimning ishlayotganini **bu sessiyada mock Supabase bilan tekshirdik**: login/signup render bo'ladi, himoyalangan sahifalar `/login`ga redirect qiladi, "Sign in with Google" aynan `https://<ref>.supabase.co/auth/v1/authorize?provider=google&redirect_to=.../auth/callback&code_challenge=...` (PKCE) URL'iga o'tadi. Real Supabase + Google sozlangach, o'sha URL Google consent ekranини ko'rsatadi.

---

## Tez-tez uchraydigan xatolar

| Belgi | Sabab | Yechim |
|-------|-------|--------|
| Login'dan keyin `?error=auth` | App callback URL allowlist'da yo'q | Bosqich 7.3 Redirect URLs |
| Google "redirect_uri_mismatch" | Google'da noto'g'ri redirect URI | Bosqich 6: `https://<ref>.supabase.co/auth/v1/callback` bo'lishi shart |
| Har bir API key "Invalid" | Portal va Gateway `API_KEY_PEPPER` farq qiladi | Bir xil qiling (Bosqich 4) |
| APISIX → gateway 401 | `GATEWAY_FORWARD_AUTH_SECRET` mos emas | Gateway va APISIX'da bir xil qiling |
| Gateway boot'da `Missing required environment variable` | `.env` to'liq emas | Bosqich 5 |
| `access_token`/`role` brauzerda | `sb_secret_` client'ga chiqib ketgan | `test:bundle` ishlating; server-only import'ni tekshiring |
