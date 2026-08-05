# Backend

AI sotuv intellekti platformasi — server qismi.

Quyida arxitektura qarorlari va **ularning sabablari** yozilgan. Matndagi
`FR-XX` va `TZ 3.5` kabi belgilar ichki spetsifikatsiya bandlariga ishora —
ular talab qayerdan kelganini kuzatish uchun saqlangan.

## Stack

| Qatlam | Tanlov |
|---|---|
| Til | TypeScript (ESM, Node 22+) |
| HTTP | Fastify 5 |
| DB | PostgreSQL 16+ |
| ORM | Drizzle |
| Validatsiya | Zod |
| Parol | argon2id |

## Ishga tushirish

```bash
npm install
```

`.env` da faqat bitta narsani to'ldirasiz — `DATABASE_URL_ADMIN` (postgres
superuser paroli bilan). Qolganini skriptlar qiladi:

```bash
npm run db:create      # bazani yaratadi
npm run db:bootstrap   # ilova rolini yaratadi va DATABASE_URL ni to'ldiradi
npm run db:migrate     # jadvallar + RLS siyosatlari
npm run verify         # tiplar + barcha tekshiruvlar
```

Oxirgi qadam **301/301 o'tishi shart**. O'tmasa — davom etmang.

| To'plam | Tekshiruv |
|---|---|
| Tenant izolyatsiyasi | 6 |
| Isbot cheklovlari | 5 |
| Auth oqimi | 24 |
| API (profil, playbook, seats, members, ruxsatlar, ko'lam) | 45 |
| Telegram + admin panel + shifrlash | 41 |
| AI tahlil quvuri (mock LLM bilan) | 60 |
| Dashboard + vazifalar + ogohlantirishlar | 36 |
| Billing mantiqi (sof funksiya) | 14 |
| Billing integratsiyasi | 28 |
| AI Playbook Builder | 14 |
| Kunlik hisobot (FR-134) | 28 |

## Skriptlar

| Buyruq | Vazifasi |
|---|---|
| `npm run dev` | Server (hot reload) |
| `npm run typecheck` | Tiplarni tekshirish |
| `npm run db:create` | Bazani yaratish |
| `npm run db:bootstrap` | Ilova rolini yaratish/parolini yangilash |
| `npm run db:generate` | Sxemadan yangi migratsiya generatsiya qilish |
| `npm run db:migrate` | Migratsiya + RLS qo'llash |
| `npm run db:verify` | Izolyatsiya (6) + cheklovlar (5) testlari |
| `npm run db:clean-test` | Qolib ketgan test tenantlarini supurish |
| `npm run verify:pipeline` | AI quvuri testi — haqiqiy LLM'siz, mock bilan |
| `npm run verify:dashboard` | Dashboard, vazifalar, ogohlantirishlar testi |
| `npm run verify:reports` | Kunlik hisobot: jadval, idempotentlik, matn |
| `npm run db:studio` | Bazani brauzerda ko'rish |

## Ikkita baza ulanishi — nega

```
DATABASE_URL         → sotuv_app   NOSUPERUSER, NOBYPASSRLS   ← ilova
DATABASE_URL_ADMIN   → postgres    superuser                   ← migratsiya, cron
```

**PostgreSQL'da superuser Row Level Security ni har doim chetlab o'tadi** —
`FORCE ROW LEVEL SECURITY` ham unga ta'sir qilmaydi.

Bu loyihada haqiqatan sodir bo'ldi: RLS siyosatlari o'rnatildi, migratsiya
"24 jadval himoyalangan" deb yozdi, lekin ilova `postgres` ostida ulangani
uchun izolyatsiya **umuman ishlamadi**. `db:verify` buni tutdi — 6/6
muvaffaqiyatsiz.

Shuning uchun ilova alohida, huquqi cheklangan rol ostida ishlaydi:
faqat `SELECT/INSERT/UPDATE/DELETE`, hech qanday DDL.

## Struktura

```
src/
  config.ts               env validatsiyasi (noto'g'ri sozlamada server ishga tushmaydi)
  server.ts               bootstrap + toza to'xtash
  auth/
    password.ts           argon2id
    tokens.ts             token generatsiyasi va xeshlash
    session.ts            sessiya hayotiy sikli, rotatsiya, o'g'irlikni aniqlash
    permissions.ts        rollar → ruxsatlar matritsasi
    context.ts            foydalanuvchining bizneslari va rollari
  http/
    app.ts                plaginlar, healthz/readyz
    errors.ts             RFC 7807 xato formati
    auth-plugin.ts        requireAuth / requireBusiness / requirePermission
    routes/auth.ts        register, login, logout, context, sessions
    verify-auth.ts        auth oqimi testi (24 tekshiruv)
  db/
    index.ts              withTenant() — tenant izolyatsiyasining kirish nuqtasi
    rls.sql               Row Level Security siyosatlari (idempotent)
    migrate.ts            migratsiya + RLS + tekshiruv
    bootstrap-role.ts     ilova rolini yaratish
    verify-isolation.ts   izolyatsiya testi (6)
    verify-constraints.ts isbot cheklovlari testi (5)
    schema/               8 fayl, 27 jadval
```

## Auth

Bitta noaniq (opaque) sessiya tokeni, `httpOnly` cookie'da, bazada SHA-256
xeshi sifatida.

**TZ dagi "access 15 daq / refresh 30 kun" sxemasidan ataylab chetlashildi.**
Qisqa access token'ning ma'nosi — bazaga murojaat qilmaslik. Lekin bizga har
so'rovda rollar va a'zolik kerak, ya'ni baza so'rovi baribir bo'ladi. Demak
ikkita token murakkablikni oshiradi, hech narsa tejamaydi. Bitta DB-token esa
**bir zumda bekor qilinadi** — JWT bilan bu imkonsiz.

| Chegara | Qiymat |
|---|---|
| Mutlaq muddat | 30 kun (rotatsiyada uzaymaydi) |
| Bo'sh turish | 14 kun |
| Rotatsiya | har 24 soatda |
| Rotatsiya grace | 30 soniya |

Grace **faqat rotatsiyaga** tegishli. Chiqish darhol kuchga kiradi —
dastlabki versiyada bu xato bor edi va test uni tutdi (chiqishdan keyin
token 30 soniya ishlayverardi).

Rotatsiya qilingan eski token grace'dan keyin ishlatilsa — o'g'irlik deb
baholanadi va foydalanuvchining **barcha** sessiyalari bekor qilinadi.

### Ruxsatlar

Kodda `if (role === 'owner')` yozilmaydi. `requirePermission('seat:manage:all')`
ishlatiladi, rollar → ruxsatlar mosligi faqat `auth/permissions.ts` da.
Yangi rol qo'shilganda bitta fayl o'zgaradi.

Rollar: `owner`, `supervisor`, `head`, `auditor`, `manager`.

### Ko'lam: "hammasi" va "faqat o'zimniki" (`http/scope.ts`)

Dastlab barcha ma'lumot marshrutlari `requirePermission(':all')` bilan
yopilgan edi. Rahbar uchun to'g'ri ishlardi, lekin **sotuvchi tizimga
kirsa ham har so'rovda 403 olardi** — ya'ni TZ 3.6 dagi FR-112
("sotuvchining shaxsiy kabineti") amalda qurib bo'lmaydigan holatda edi.

Endi `conversations`, `tasks` va `dashboard/seats/:seatId` marshrutlari
ruxsatni `scope.ts` orqali hal qiladi:

| Ko'lam | Natija |
|---|---|
| `all` | cheklovsiz |
| `own` | faqat foydalanuvchining `seatId` si |
| `none` | 404 |

Begona `seatId` so'ralsa **404**, 403 emas — 403 "bunday sotuvchi bor"
degan ma'lumotni oshkor qilardi.

`department` ataylab `own` kabi ishlaydi: bo'lim bo'yicha filtrlash
`seat.department_id` ni tekshirishni talab qiladi va u hali qurilmagan.
Kengroq huquq berib qo'yishdan ko'ra torroq berish xavfsiz.

Sotuvchi vazifaning faqat **holatini** o'zgartira oladi (`task:update:own`);
muddat yoki mas'ulni o'zgartirsa, kechikkan vazifani oldinga surib
kuzatuvni ma'nosiz qilib qo'yardi.

Frontend ham ruxsatlar ro'yxatini oladi va UI ni shunga qarab yig'adi, lekin
**haqiqiy chegara serverda**. Frontend hech qachon xavfsizlik chegarasi emas.

## Playbook versiyalash

Mavjud versiya **hech qachon o'zgartirilmaydi**. Har saqlash yangi qator
yaratadi va faqat bittasi faol bo'ladi (buni qisman unikal indeks kafolatlaydi).

Sabab: `analysis` yozuvlari o'zi baholangan versiyaga bog'lanadi. Versiyani
joyida tahrirlasak, o'tgan oyning ballari bugungi mezon bo'yicha izohlanadi —
tarix buziladi.

Struktura `src/playbook/schema.ts` da qat'iy tekshiriladi: vaznlar yig'indisi
aynan 100%, takroriy kodlar yo'q, har mezon mavjud kategoriyaga tegishli, har
kategoriyada kamida bitta faol mezon. Buzilgan playbook xato bermaydi —
shunchaki yomon baholar beradi, shuning uchun kirishda to'xtatiladi.

`POST /playbook/validate` saqlamasdan tekshiradi — muharrir har o'zgarishda
chaqiradi va foydalanuvchi xatoni saqlashdan oldin ko'radi.

## API

```
GET    /api/v1/auth/context
POST   /api/v1/auth/register | login | logout | logout-all
GET    /api/v1/auth/sessions
PATCH  /api/v1/auth/me                                    (FR-160 profil)
POST   /api/v1/auth/change-password                       (barcha sessiyalar bekor bo'ladi)

GET    /api/v1/businesses/:id
PATCH  /api/v1/businesses/:id
GET    /api/v1/businesses/:id/profile
PUT    /api/v1/businesses/:id/profile

GET    /api/v1/businesses/:id/playbook
POST   /api/v1/businesses/:id/playbook
POST   /api/v1/businesses/:id/playbook/validate
POST   /api/v1/businesses/:id/playbook/generate   (AI Playbook Builder, FR-12 — saqlamaydi)
GET    /api/v1/businesses/:id/playbook/versions
GET    /api/v1/businesses/:id/playbook/versions/:version
POST   /api/v1/businesses/:id/playbook/versions/:version/activate

GET    /api/v1/businesses/:id/seats
POST   /api/v1/businesses/:id/seats
PATCH  /api/v1/businesses/:id/seats/:seatId
DELETE /api/v1/businesses/:id/seats/:seatId
POST   /api/v1/businesses/:id/seats/:seatId/activation-link

GET    /api/v1/businesses/:id/members
POST   /api/v1/businesses/:id/members/invite
PATCH  /api/v1/businesses/:id/members/:memberId
DELETE /api/v1/businesses/:id/members/:memberId

GET    /api/v1/businesses/:id/conversations
GET    /api/v1/businesses/:id/conversations/:convId      (transkript + ballar + isbot)
POST   /api/v1/businesses/:id/conversations/:convId/analyze  (qayta tahlil, FR-85)

GET    /api/v1/businesses/:id/tasks                      (?status ?seatId ?view=today|overdue)
POST   /api/v1/businesses/:id/tasks
PATCH  /api/v1/businesses/:id/tasks/:taskId
GET    /api/v1/businesses/:id/tasks/analytics            (FR-129d)

GET    /api/v1/businesses/:id/alerts                     (?status ?kind)
PATCH  /api/v1/businesses/:id/alerts/:alertId            (seen | resolved)

GET    /api/v1/businesses/:id/dashboard/kpi              (joriy + oldingi davr)
GET    /api/v1/businesses/:id/dashboard/leaderboard
GET    /api/v1/businesses/:id/dashboard/criteria         (eng zaif mezon bilan)
GET    /api/v1/businesses/:id/dashboard/trend            (?granularity=day|week)
GET    /api/v1/businesses/:id/dashboard/seats/:seatId    (FR-112 sotuvchi kabineti)

GET    /api/v1/businesses/:id/reports/daily              (oxirgi 14 hisobot)
PUT    /api/v1/businesses/:id/reports/daily/settings     (chat id + soat)
POST   /api/v1/businesses/:id/reports/daily/send         (darhol yuborish)

GET    /api/v1/businesses/:id/billing/status              (hammaga — trial banner)
GET    /api/v1/businesses/:id/billing                     (egasi — balans, tranzaksiyalar)
POST   /api/v1/businesses/:id/billing/topup                (qo'lda to'ldirish)

GET    /api/v1/businesses/:id/integrations/telegram
POST   /api/v1/businesses/:id/integrations/telegram
DELETE /api/v1/businesses/:id/integrations/telegram
PATCH  /api/v1/businesses/:id/seats/:seatId/telegram
POST   /api/v1/webhooks/telegram/:integrationId          (sessiyasiz, sir bilan)
```

Begona tenant **404** oladi, 403 emas — 403 "bunday biznes bor" degan
ma'lumotni oshkor qilardi.

## AI tahlil quvuri (TZ 3.5)

```
Telegram xabar → sessiya → [jimlik 20 daq] → scheduler → navbat → worker
                                                                    │
                        pre-filter (LLM'siz) ───────────────────────┤
                        2-bosqich: ekstraksiya (LLM) ───────────────┤
                        ishonch < 0.4 → bayroq, baholanmaydi (FR-83)┤
                        3-bosqich: isbotli baholash (LLM) ──────────┤
                        ISBOTNI TEKSHIRISH (kod, LLM emas) ─────────┘
```

Muhim qarorlar:

- **Navbat Postgres'da** (`analysis_job`), Redis'siz. `FOR UPDATE SKIP
  LOCKED` + retry (30s → 90s → 270s) + DLQ (`dead`). Worker server bilan
  bitta jarayonda; yuk oshsa `WORKER_ENABLED=false` bilan ajratiladi.
- **Isbot dasturiy tekshiriladi**: model keltirgan iqtibos transkriptda
  qidiriladi (normalizatsiya bilan). Topilmasa ball bekor (`null`) va
  tahlil bayroqlanadi. LLM'ga ishonch prompt darajasida emas, kod
  darajasida — bu FR-80/82 ning yuragi.
- **Qayta tahlil avtomatik**: sessiyaga yangi xabar kelsa holat
  `received` ga qaytadi va jimlikdan keyin suhbat TO'LIQ holda qayta
  baholanadi. Eski natija almashtiriladi (bitta suhbat — bitta analysis).
- **Promptlar bazada** (`prompt_template`, FR-88): faol qator kod ichidagi
  standartni bekor qiladi; ishlatilgan versiya `analysis.model_versions`
  ga yoziladi.
- **Xarajat har tahlilda** (FR-89): token + $ + qaysi model (FR-87).
- LLM kaliti admin paneldan kiritiladi (shifrlangan) — `.env` da LLM
  kaliti YO'Q.

Baholanmagan mezon (`score = null`) umumiy foizni **jazolamaydi**:
kategoriya ichida faqat baholanganlar o'rtachasi olinadi, butunlay
baholanmagan kategoriya vazni qolganlarga qayta taqsimlanadi.

## Vazifalar va ogohlantirishlar (TZ 3.7A / 3.8)

Tahlil o'zi qiymat bermaydi — **harakat** beradi. Shu sababli:

- **MENEJER va'dalari avtomatik vazifaga aylanadi** (FR-127). Mijozning
  "o'ylab ko'raman" degani vazifa emas — signal. Model muddatni ISO
  sanaga aylantirib beradi ("ertaga" → `dueIso`), u `task.due_at` bo'ladi.
- **"Kechikkan" alohida holat emas** — `dueAt < now()` dan hisoblanadi.
  Alohida saqlansa uni yangilab turuvchi cron kerak bo'lardi va u har
  doim ozgina eskirgan bo'lardi.
- **Qayta tahlilda bajarilgan vazifa o'chmaydi** — faqat ochiq
  (pending/in_progress) avtomatik vazifalar qayta yoziladi.
- Ogohlantirishlar tizim yaratadi, API faqat boshqaradi (FR-137:
  yangi → ko'rildi → hal qilindi): qizil bayroq, javobsiz mijoz (FR-132),
  muddati o'tgan va'da (FR-133, worker har 5 daqiqada tekshiradi),
  past ishonch (FR-83). Hammasi dedupe kaliti bilan — takrorlanmaydi.

Dashboard'da "aniqlanmadi" (score null) hech qayerda past ball sifatida
hisoblanmaydi — alohida `unknownCount` ustunida ko'rsatiladi.

## Kunlik hisobot (FR-134)

`reports/daily.ts` — worker soatiga bir marta uradi, hisobot esa
biznesning **o'z vaqt zonasidagi** belgilangan soatda ketadi. Sozlamalar
(`reportChatId`, `reportHour`) `integration.config` ichida — hisobot
Telegram botiga bog'liq va usiz ma'nosi yo'q, shuning uchun yangi jadval
ham, migratsiya ham kerak emas.

- **Matn LLM'siz tuziladi.** TZ da "AI yozgan matn" deyilgan, lekin
  hisobot har kuni, har biznes uchun ishlaydi — LLM bo'lsa bu doimiy
  xarajat va doimiy nosozlik manbai. Hisobotdagi hamma narsa raqam va
  nom, izohlash talab qilinmaydi. Bu loyihaning "aniq qoidali narsani
  modelga ishonmaymiz" tamoyili bilan bir xil.
- **Idempotent**: bitta biznes + bitta sana uchun bitta qator. Worker
  qayta ishga tushsa ham takror xabar ketmaydi.
- **Yozuv har doim saqlanadi**, yuborish muvaffaqiyatsiz bo'lsa ham —
  hisobot interfeysda ko'rinadi va sabab aniq ko'rsatiladi
  ("chat id sozlanmagan", "yuborilmadi: ...").
- Oyna — **oxirgi 24 soat**, kalendar kuni emas: hisobot soati
  sozlanadigan bo'lgani uchun kalendar kuni bugun ertalabki suhbatlarni
  tashlab ketardi.

`telegram/send.ts` ataylab `ingest.ts` dan alohida: yig'ish hech qachon
to'xtamasligi kerak (FR-156), yuborish esa tashqi tarmoqqa bog'liq.
`parse_mode` berilmaydi — mijoz nomi ichidagi `_` yoki `*` Markdown'ni
buzib, Telegram butun xabarni rad etardi.

## AI Playbook Builder (FR-12)

LLM'dan kodlar (A1, B2) yoki aniq 100% vazn yig'indisi HECH QACHON
so'ralmaydi — bu loyihaning "modelga aniq qoidali narsani ishonmaymiz"
tamoyili bilan bir xil. Model faqat kategoriya TARTIBI
(`categoryIndex`) va mazmunni beradi; kod (`ai/playbook-builder.ts`)
kodlarni va vaznlarni deterministik tuzadi — natija har doim
`playbookBodySchema` orqali o'tadi, LLM qanchalik "iflos" javob
qaytarmasin (vaznlar 100% emas, kategoriya mezonsiz qoladi va h.k.).

`POST /playbook/generate` faqat QORALAMA qaytaradi, SAQLAMAYDI —
foydalanuvchi ko'rib, tahrirlab, keyin oddiy `POST /playbook` orqali
saqlaydi.

**Muhim qoida:** bazadan o'qilgan har qanday playbook qatori
(`GET /playbook`, `GET /playbook/versions/:v`) qayta zod orqali
o'tkaziladi (`normalizePlaybookRow`) — chunki eski/qo'lda kiritilgan
yozuvlar to'liqsiz ichki obyektlarga ega bo'lishi mumkin va frontend
`promptNotes.stage1.vocabulary` kabi ichki maydonga ishonib murojaat
qiladi. Bu haqiqiy production xato edi (demo skript sinovida topildi)
va endi regression testi bilan himoyalangan.

## Billing (TZ 3.10)

Holat mashinasi (`billing/engine.ts`, `decideBillingAction` — sof
funksiya, DB'siz sinaladi): `trial → active → grace → degraded`,
istalgan bosqichda balans to'ldirilsa avtomatik `active`ga qaytadi.

- **`seatPrice` ro'yxatdan o'tishda "qulflanadi"** (`subscription.seat_price`
  ustuniga yoziladi) — platforma narxi (`SEAT_PRICE_UZS`) keyin
  o'zgarsa ham, mavjud mijozlarga orqaga ta'sir qilmaydi. **Bu maydonni
  to'ldirishni unutish** — ya'ni faqat `config`dan foydalanib,
  bazaga yozmaslik — hech kimdan pul yechilmasligiga olib kelgan
  haqiqiy bug edi (test yozilganda topildi va tuzatildi).
- `runBillingTick` worker ichida soatlab ishlaydi, idempotent.
- **FR-156 amalda**: `enqueueAnalysis` va `sweepIdleSessions` obuna
  `degraded`/`cancelled` bo'lsa yangi tahlilni bloklaydi, lekin
  `telegram/ingest.ts` bu modulga umuman bog'liq emas — yig'ish
  hech qachon to'xtamaydi.
- Haqiqiy Payme/Click integratsiyasi hali yo'q (merchant hisobi
  kerak) — hozircha balans qo'lda to'ldiriladi (`POST /billing/topup`).

⚠️ **Test yozganda e'tibor bering:** `npm run dev` fonda ishlab
tursa, uning worker sikli test skriptlari bilan BIR XIL navbat
uchun raqobatlashadi (`FOR UPDATE SKIP LOCKED` — kim tezroq
ulgursa). Testdan oldin dev serverni to'xtating.

## Test ma'lumotlari o'zidan keyin tozalanadi

`verify:*` skriptlari haqiqiy ro'yxatdan o'tish oqimidan foydalanadi —
demak har yurgizish yangi foydalanuvchi va yangi biznes yaratadi. Bir
necha skript o'zidan keyin tozalamagani uchun dev bazasi 99 ta biznes va
43 ta hisobga to'lib ketgan edi va haqiqiy demo ma'lumotini topib
bo'lmasdi.

Endi hammasi `db/clean-test-data.ts` orqali tozalaydi:

- tozalash **email bo'yicha** ishlaydi (`%@test.local`), slug bo'yicha
  emas — slug nomdan hosil bo'ladi va tag'ni har doim ham o'z ichiga
  olmaydi, shuning uchun eski usul bizneslarni ortda qoldirardi;
- biznes birinchi o'chiriladi, qolgani `on delete cascade` bilan ketadi
  (jadval qo'shilganda tozalash ro'yxati eskirmasin uchun);
- tozalash `finally` da va **jim** (`cleanupTestDataQuietly`) — u yiqilsa
  testning o'z natijasi ekranda ko'rinib qolaveradi.

Ikkita jim bog'liqlik ham shu bilan yo'q qilindi:

1. `verify:telegram` o'z provayderini faollashtirardi (bu qolganini
   o'chiradi), keyin uni o'chirib yuborardi — natijada `npm run verify`
   dan keyin dev muhitida **faol LLM provayder qolmasdi** va tahlil
   jimgina ishlamay qo'yardi. Endi oldingi faol provayder tiklanadi.
2. `verify:playbook-ai` "faol provayder yo'q" degan taxminga tayanardi.
   Provayder sozlangach, o'sha tekshiruv **haqiqiy LLM'ni chaqirib**
   200 qaytardi — ya'ni testlar pul sarflay boshlagan bo'lardi. Endi
   test kerakli holatni o'zi tayyorlaydi va tiklaydi.

To'liq `npm run verify` dan keyin bazada faqat demo ma'lumoti qoladi.
Qolib ketganini supurish: `npm run db:clean-test`.

## Ikkita qoida — buzilmaydi

### 1. Har bir tenant so'rovi `withTenant()` ichida

```ts
const rows = await withTenant(businessId, (tx) =>
  tx.select().from(conversation)          // WHERE business_id yozish shart emas
);
```

RLS avtomatik cheklaydi. `withTenant` siz so'rov **bo'sh natija** qaytaradi —
sukut bo'yicha holat "hammasi yopiq".

Chetlab o'tish faqat `withoutTenantIsolation(sabab, ...)` orqali. U **boshqa
ulanishdan** (egalik roli) foydalanadi, ya'ni chetlab o'tish kredensial
darajasida bo'ladi. Siyosatlarda sessiya o'zgaruvchisi orqali "bypass"
teshigi ataylab qoldirilmagan — aks holda SQL injection topilsa, hujumchi
`SET app.bypass_rls='on'` bilan butun izolyatsiyani o'chirardi.

### 2. Isbotsiz ball yo'q

`criterion_score` jadvalida DB darajasidagi cheklov bor:

```sql
CHECK (score IS NULL OR evidence_quote IS NOT NULL)
```

Ya'ni ball qo'yilgan bo'lsa, transkriptdan iqtibos **majburiy**. Model iqtibos
keltira olmasa `score = NULL` ("aniqlanmadi") bo'ladi.

Bu mahsulotning asosiy farqi va u kelishuv emas — strukturaviy kafolat.

## Baza varianti hali tanlanmagan

Mahalliy Postgres, Docker yoki bulut (Neon/Supabase) — qaysi biri bo'lsa ham
`DATABASE_URL` ni o'zgartirish kifoya. Sxema va migratsiyalar tayyor.
