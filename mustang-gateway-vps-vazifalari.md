# Mustang Gateway — Sandbox/Prod split: VPS'da qilinadigan ishlar

**Sana:** 2026-07-22. Manba: `mustang-gateway-docs-sandbox-qarorlar.md`.

Kod tomoni (gateway environment tekshiruvi, APISIX declarative config +
sync skript, docs sahifasi + "Try it" paneli) shu branch'da tayyor va
test/build/typecheck bilan tekshirilgan (quyida "Kod tomonida qilingan
ishlar" bo'limiga qarang). Bu fayl faqat **VPS'da qo'lda bajarilishi kerak
bo'lgan** ishlarni sanaydi.

---

## 0. MUHIM — eski route'larni tozalash (birinchi bo'lib qiling)

Agar `infra/mustang-mock/register-apisix-routes.sh` avval haqiqiy VPS
APISIX'ida ishga tushirilgan bo'lsa (commit `815f34f`), u yerda hali ham
22 ta **aniq uri** route (`/api/v1.8.2/mustang/ping` va h.k.) + `plugin_configs/1`
+ `upstreams/mustang` turibdi. Bu skript endi repo'dan o'chirilgan — o'rnini
`infra/apisix/services.json` + `sync-apisix.mjs` egalladi (2 ta wildcard route).

**Nega bu muhim:** APISIX aniq (`exact`) uri'ni har doim wildcard'dan
(`/api/v1.8.2/*`) ustun qo'yadi — priority maydonidan qat'i nazar. Eski 22
route o'chirilmasa, ular yangi test/prod ajratishni **jimgina chetlab
o'tadi**: barcha so'rovlar eski bitta upstream'ga (faqat mustang-mock, muhit
ajratuvisiz) ketaveradi, yangi `services.json` esa ishlamayotgandek tuyuladi.

Tekshirish va tozalash:

```bash
ADMIN=http://127.0.0.1:9180
KEY=<APISIX admin key>

# Eski route'lar hali turgan-turmaganini tekshiring:
curl -s "$ADMIN/apisix/admin/routes/mustang-ping" -H "X-API-KEY: $KEY" | head -c 200

# Agar topilsa — hammasini o'chiring:
for id in mustang-ping mustang-notice mustang-xmltopdf mustang-xmltohtml \
  mustang-validationreporttopdf mustang-validate mustang-styledinvoicetofx \
  mustang-phive mustang-pdf2pdfa mustang-parse mustang-invoice2xml \
  mustang-extract mustang-detach mustang-combine mustang-combinexml \
  mustang-ciitoubl mustang-cii2ubl mustang-calculate \
  s3-upload s3-list s3-download s3-delete; do
  curl -s -X DELETE "$ADMIN/apisix/admin/routes/$id" -H "X-API-KEY: $KEY" >/dev/null
done
curl -s -X DELETE "$ADMIN/apisix/admin/plugin_configs/1" -H "X-API-KEY: $KEY"
curl -s -X DELETE "$ADMIN/apisix/admin/upstreams/mustang" -H "X-API-KEY: $KEY"
```

Agar bu skript hech qachon ishga tushirilmagan bo'lsa (faqat kod sifatida
commit qilingan bo'lsa) — bu qadam kerak emas, lekin baribir yuqoridagi
tekshiruv bilan tasdiqlab qo'ying.

---

## 1. mustang-mock konteynerini APISIX tarmog'ida ko'tarish

```bash
cd infra/mustang-mock
docker compose up -d --build
docker compose ps
# APISIX konteyneridan ko'rinishini tasdiqlang:
docker exec docker-apisix-apisix-1 curl -s http://mustang-mock:4001/api/v1.8.2/mustang/ping
```

Bu servis hech qachon hostga ochilmaydi (`ports:` yo'q) — faqat APISIX ichki
tarmoqdan ko'radi. `APISIX_NETWORK` bir xil qiymatga ega ekanini tekshiring
(root `.env` dagi bilan mos, standart: `docker-apisix_apisix`).

---

## 2. Yangi APISIX topologiyasini qo'llash (`services.json`)

```bash
cd infra/apisix
export ADMIN=http://127.0.0.1:9180
export KEY=<APISIX admin key>
export SECRET=<GATEWAY_FORWARD_AUTH_SECRET — .env dagi bilan bir xil>

node sync-apisix.mjs --dry-run    # avval nima yuborilishini ko'rib chiqing
node sync-apisix.mjs              # qo'llang
```

Bu 2 ta upstream (`mustang-prod-upstream` → haqiqiy Mustang,
`mustang-mock-upstream` → mustang-mock:4001), 2 ta service
(`mustang-mock-prod`, `mustang-mock-test`) va 2 ta wildcard route
(`/api/v1.8.2/*`, `gw_test_*` kalitlar test route'iga, qolgani prod
catch-all'ga) yaratadi. Idempotent — `services.json` o'zgarganda qayta
ishga tushiring.

**Tekshirish:**

```bash
curl -s "$ADMIN/apisix/admin/services/mustang-mock-test" -H "X-API-KEY: $KEY" | jq .value.plugins
curl -s "$ADMIN/apisix/admin/routes/mustang-test-route" -H "X-API-KEY: $KEY" | jq .value.vars
```

---

## 3. Admin API xavfsizligi (avvaldan belgilangan, hali bajarilmagan)

`docker-apisix` stack hali ham na'muna (`apache/apisix-docker`) konfiguratsiyasi
bilan kelgan bo'lishi mumkin — bu holda `admin_key` **hammaga ma'lum default
qiymat**da qolgan bo'ladi. Bu endi yanada muhimroq: Admin API kalitini
bilgan har kim `services.json`dagi forward-auth zanjirini o'chirib, butun
autentifikatsiyani chetlab o'tishi mumkin.

```bash
# config.yaml da tekshiring:
docker exec docker-apisix-apisix-1 cat /usr/local/apisix/conf/config.yaml | grep -A3 admin
# Agar default bo'lsa — yangi tasodifiy kalit bilan almashtiring va APISIX'ni qayta ishga tushiring.
# 9180-port internetdan yopiq ekanini tasdiqlang (faqat 127.0.0.1 yoki ichki tarmoq).
```

---

## 4. Gateway'ni qayta deploy qilish (environment tekshiruvi + test-key cheklovlari)

Kod tomonida `apps/gateway/src/auth/auth.service.ts` o'zgardi:
kalitning o'z prefiksidan (`gw_live_`/`gw_test_`) olingan muhit endi
`api_keys.environment` (DB/Redis) bilan solishtiriladi — mos kelmasa 401.
Shuningdek `test` muhitidagi kalitlar uchun rate-limit/oylik limit qattiq
shift (ceiling) bilan cheklanadi, DB'da qanday sozlangan bo'lishidan qat'i
nazar.

```bash
# root .env ga (ixtiyoriy — standart qiymatlar allaqachon oqilona):
TEST_ENV_RATE_LIMIT_PER_MIN_CEILING=30     # default shu
TEST_ENV_MONTHLY_LIMIT_CEILING=2000        # default shu

git pull
docker compose up -d --build gateway
docker compose logs -f gateway
```

> **Diqqat:** `30/min` va `2000/oy` qiymatlarini men (Claude) mantiqiy
> standart sifatida tanladim — bu biznes qarori, sizga mos kelmasa `.env`
> orqali o'zgartiring (kodni qayta deploy qilish shart emas).

---

## 5. Portal'ni qayta deploy qilish (docs sahifasi + "Try it" paneli)

```bash
docker compose up -d --build portal
```

`NEXT_PUBLIC_*` o'zgarmagan, shuning uchun oddiy rebuild yetarli (build-arg
qayta kiritish shart emas).

---

## 6. "Try it" panelini haqiqiy VPS ustida sinash

Bu funksiya faqat `mustang-mock-test` service'iga CORS ulangandan keyin
ishlaydi — lokal muhitda (Docker yo'q) sinab bo'lmadi, shuning uchun bu
haqiqiy birinchi test bo'ladi:

1. `https://smartlist.uz/docs` ga kiring (login qilgan holda).
2. Keys sahifasidan `test` muhitli yangi kalit yarating (`gw_test_...`).
3. Docs sahifasidagi "API key for Try it" maydoniga shu kalitni kiriting.
4. `/mustang/ping` kabi oddiy endpoint uchun "Send GET request" bosing —
   `200` va `pong` ko'rinishi kerak.
5. Brauzer DevTools → Network'da so'rov `api.smartlist.uz`ga ketganini va
   CORS xatosi yo'qligini tasdiqlang.
6. Bir nechta so'rovni tez-tez yuborib `limit-count` (60/min, IP bo'yicha)
   ishlayotganini tekshiring — chegaradan oshganda 429 kelishi kerak.
7. Real `gw_live_` kalitni Try it maydoniga qo'yib sinab ko'ring — CORS
   xatosi bilan bloklanishi kerak (bu kutilgan xavfsizlik xatti-harakati,
   prod service'da cors plugin yo'q).

---

## 7. To'liq zanjirni tasdiqlash

```bash
# test kalit → mustang-mock'ga borishi kerak (fake javob)
curl -i https://api.smartlist.uz/api/v1.8.2/mustang/ping -H "Authorization: Bearer gw_test_xxx"

# live kalit → haqiqiy Mustang'ga borishi kerak
curl -i https://api.smartlist.uz/api/v1.8.2/mustang/ping -H "Authorization: Bearer gw_live_xxx"

# muhit mos kelmasa (masalan DB'da environment qo'lda o'zgartirilgan) → 401 kutiladi
```

Portal'ning Usage sahifasida ikkala chaqiruv ham ko'rinishi kerak.

---

## 8. Ochiq / keyinga qoldirilgan narsalar

- OpenAPI spec generatsiyasi (Postman kolleksiyadan) — hali qilinmagan.
- Test kalitning muddati/scope'i bo'yicha alohida cheklov (qarorlar fayli
  §3) — hali aniqlanmagan, kelajakda ko'rib chiqiladi.
- `smartlist.uz` dan boshqa (masalan `www.smartlist.uz`) origin kerak bo'lsa,
  `infra/apisix/services.json`dagi `cors.allow_origins`ni yangilab
  `sync-apisix.mjs`ni qayta ishga tushiring.

---

## Kod tomonida qilingan ishlar (ma'lumot uchun, VPS ishi emas)

- `packages/shared/src/keys.ts`: `parseKeyEnvironment()` qo'shildi.
- `apps/gateway/src/auth/auth.service.ts` + `config/configuration.ts`:
  muhit solishtirish (4-bosqich) va test-kalit ceiling'lari (6/7-bosqich).
  `auth.service.spec.ts`ga yangi testlar (barchasi o'tdi, jami 51 test).
- `infra/apisix/services.json` + `sync-apisix.mjs`: yangi deklarativ
  konfiguratsiya + idempotent sync skript. `infra/mustang-mock/register-apisix-routes.sh`
  o'chirildi (o'rnini bosdi). `DEPLOY.md` va `infra/apisix/README.md`
  yangilandi.
- `apps/portal/src/lib/docs/endpoints.ts`: `SERVICES` (environment →
  service_id) metadata qo'shildi.
- `apps/portal/src/app/(dashboard)/docs/`: `TryItContext.tsx` (umumiy API
  key maydoni) + `TryItPanel.tsx` (har bir endpoint uchun jonli so'rov
  formasi) qo'shildi, `page.tsx`ga ulandi, "Environments" bo'limi qo'shildi.
  `TryItPanel.test.tsx` — 3 test, hammasi o'tdi.
- Repo bo'yicha: build 4/4, typecheck 6/6, testlar: shared 28 + gateway 51 +
  portal 19 — hammasi o'tdi.
