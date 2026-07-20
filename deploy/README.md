# Going live on domains

Two public hostnames, both TLS-terminated by **nginx on the VPS host**:

| Domain | Proxies to | What it is |
|--------|-----------|------------|
| `smartlist.uz` | `127.0.0.1:3000` | Portal (Next.js container) |
| `api.smartlist.uz` | `127.0.0.1:9080` | APISIX edge → gateway auth → Mustang |

```
 browser ─https─▶ nginx :443 ─http─▶ 127.0.0.1:3000   (portal)
 client  ─https─▶ nginx :443 ─http─▶ 127.0.0.1:9080   (APISIX → gateway → mustang)
```

## 1. DNS

Point both A records at the VPS IP:

```
smartlist.uz        A   <vps-ip>
www.smartlist.uz    A   <vps-ip>
api.smartlist.uz    A   <vps-ip>
```

## 2. Nginx + TLS

```bash
sudo apt install -y nginx certbot python3-certbot-nginx

sudo cp deploy/nginx/smartlist.uz.conf     /etc/nginx/sites-available/smartlist.uz
sudo cp deploy/nginx/api.smartlist.uz.conf /etc/nginx/sites-available/api.smartlist.uz
sudo ln -s /etc/nginx/sites-available/smartlist.uz     /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/api.smartlist.uz /etc/nginx/sites-enabled/

sudo nginx -t && sudo systemctl reload nginx

# certbot rewrites each file in place: adds the :443 block + HTTP→HTTPS redirect.
sudo certbot --nginx -d smartlist.uz -d www.smartlist.uz
sudo certbot --nginx -d api.smartlist.uz
```

Make sure the containers are up and bound to loopback first:
`docker compose ps` → portal on `127.0.0.1:3000`, APISIX on `:9080`.

## 3. Supabase auth URLs (portal)

Supabase → **Authentication → URL Configuration**:

- **Site URL:** `https://smartlist.uz`
- **Redirect URLs (allowlist):** `https://smartlist.uz/auth/callback`

Google OAuth uses `window.location.origin/auth/callback`, which is now
`https://smartlist.uz/auth/callback` — without it in the allowlist, customer
Google sign-in fails after consent. (Admin email/password sign-in does not need
this.) No portal env change is required: the browser derives its origin from the
domain automatically.

## 4. Database migration + admin seed

Apply the admin-role migration to Supabase (SQL editor or `psql`):

```bash
# packages/db/migrations/0002_admin_role.sql — adds profiles.role
```

Then seed each admin (email/password; no self-service admin signup):

```bash
cd apps/portal
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
node scripts/seed-admin.mjs admin@smartlist.uz 'a-strong-password'
```

Log in at `https://smartlist.uz/login` with those credentials → the **Admin**
tab appears in the nav (system-wide Overview / Users / API Keys / Usage).

## 5. Verify

```bash
curl -I https://smartlist.uz/login                       # 200, valid cert
curl -s https://api.smartlist.uz/api/v1.8.2/mustang/ping  # 401 (no key)
curl -s https://api.smartlist.uz/api/v1.8.2/mustang/ping -H "apikey: <key>"  # pong
```
