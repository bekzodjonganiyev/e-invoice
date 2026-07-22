# Mustang Gateway — API Docs va Sandbox Arxitekturasi: Qarorlar

**Sana:** 2026-07-22

---

## 1. Muhit ajratish printsipi

- Kalit prefiksi (`test_` / `prod_`) — bu **faqat routing uchun**, xavfsizlik mexanizmi emas.
- Haqiqiy xavfsizlik chegarasi — Gateway'ning Supabase'dagi `api_keys` jadvalidan kalitni tekshirishi.
- **Muhim qaror:** Gateway `/auth/validate` ichida faqat "kalit haqiqiymi?" emas, balki **"bu kalit aynan shu muhit uchunmi?"** ni ham tekshirishi kerak — ya'ni DB'dagi `api_keys.environment` ustuni so'rov kelgan muhit bilan solishtiriladi. Bu APISIX yo'naltirishiga qo'shimcha himoya qatlami (defense in depth), chunki Gateway APISIX'ning to'g'ri route tanlaganiga ishonib qolmasligi kerak.

---

## 2. APISIX arxitekturasi

### Route tanlash mexanizmi
- APISIX route'ni ikki bosqichda tanlaydi: avval `uri` mos kelishi, keyin `vars` filtri.
- `vars: [["http_apikey", "~~", "^test_"]]` yoki `^prod_` — shu orqali bitta `uri`ga ega ikkita route bir-biridan ajratiladi.
- Tanlash **route darajasida** bo'ladi, `service` faqat upstream + plugin konfiguratsiyasini takrorlamaslik uchun konteyner.

### Route sonini kamaytirish (asosiy qaror)
- Agar barcha endpointlarda forward-auth va upstream bir xil bo'lsa, **22 ta alohida route shart emas** — wildcard bitta route yetarli:
  ```
  uri: /api/*  + vars: ^test_  → test-service
  uri: /api/*  + vars: ^prod_  → prod-service
  ```
- Natija: 44 ta o'rniga **2 ta route**. Mustang'ga yangi endpoint qo'shilganda hech narsa o'zgartirish shart emas — avtomatik wildcard orqali o'tadi.
- Alohida route faqat **istisno** hollar uchun qoladi (masalan, fayl yuklash endpointida katta body limit, yoki bitta og'ir endpointda pastroq rate limit).
- Yangi API versiyasi chiqsa (`/v2/api/*`) — yangi wildcard route qo'shiladi, eskisi o'zgarmaydi.

### Service object
- Ikkita service: `test-service` (upstream = mock server) va `prod-service` (upstream = haqiqiy Mustang server).
- Ikkalasida ham bir xil `forward-auth` plugin (bitta Gateway'ga ishora qiladi) — faqat upstream farq qiladi.

---

## 3. Test (sandbox) muhit

- Test upstream — hali qurilmagan **Node.js Mustang mock server**.
- Mock server faqat Docker ichki tarmoqda (`docker-apisix_apisix` network) ishlaydi, port tashqariga ochilmaydi — faqat APISIX ko'radi.
- Test kalit faqat login qilgan (Google OAuth) userga beriladi — anonim sandbox foydalanish yo'q.
- Test kalitning muddati va scope'i alohida cheklanishi mumkin (kelajakda aniqlanadi).

---

## 4. Docs sahifasi ("Try it")

- Docs UI mavjud Portal ichida joylashadi (`smartlist.uz/docs`), alohida Swagger/Scalar servisi hozircha shart emas — keyinchalik kerak bo'lsa qo'shiladi.
- "Try it" paneli brauzerdan to'g'ridan-to'g'ri `api.domain/api/*`ga fetch qiladi (mavjud route'lar orqali, qo'shimcha proxy qatlam shart emas).
- Buning uchun **test-service route'iga `cors` plugin qo'shiladi** (faqat `smartlist.uz` originiga ruxsat) — bu yagona qo'shimcha talab.
- Test kalit brauzer network tab'ida ko'rinishi normal holat (Stripe ham shunday qiladi test rejimida).

---

## 5. Xavfsizlik choralari (test-service uchun qo'shimcha)

| Chora | Sabab |
|---|---|
| `cors` plugin (faqat `smartlist.uz`) | "Try it" paneli uchun zarur |
| `limit-count` (IP bo'yicha, prod'dan qattiqroq, masalan 60/min) | Docs sahifasi ochiq, anonim skanerlash ehtimoli bor |
| Gateway'da environment double-check | APISIX yo'naltirishiga yolg'iz ishonmaslik uchun |
| Kalitlar uzun va tasodifiy | Brute-force bilan topib bo'lmasligi uchun |
| Admin API porti (9180) tashqaridan yopiq | Oldindan belgilangan, hali bajarilmagan xavfsizlik vazifasi |

---

## 6. Konfiguratsiya boshqaruvi (operatsion qaror)

- Route/service/plugin konfiguratsiyasi qo'lda curl bilan emas, **bitta YAML/JSON fayl** (git'da versiyalangan) orqali boshqariladi.
- Alohida skript shu faylni o'qib Admin API'ga PUT qiladi (idempotent) — o'zgarishlar tarixi git log'da saqlanadi.
- **APISIX konfiguratsiya o'zgarishi (route/service/plugin) restart talab qilmaydi** — Admin API orqali kiritilgan o'zgarish `etcd` orqali darhol (hot reload) barcha worker'larga tarqaladi.
- Restart faqat quyidagi hollarda kerak: `config.yaml` asosiy fayli o'zgarsa, custom Lua plugin yozilsa/o'zgartirilsa, yoki nginx darajasidagi sozlamalar (worker_processes, SSL fayl yo'li) o'zgarsa.

---

## 7. Keyingi qadamlar (ochiq)

- [ ] Gateway'da prefiks-based environment parse + DB environment tekshiruvi (kod darajasida)
- [ ] `mustang-mock` Node.js serverini yaratish va Docker Compose'ga qo'shish
- [ ] `test-service` va `prod-service`ni Admin API orqali yaratish
- [ ] Mavjud route'larni wildcard'ga qisqartirish (22 dan 2 taga)
- [ ] `test-service`ga `cors` va `limit-count` plugin qo'shish
- [ ] OpenAPI spec generatsiya qilish (Postman kolleksiyadan) va docs sahifasida ko'rsatish
- [ ] Route konfiguratsiyasini YAML fayl + sync skript orqali boshqarishga o'tish
