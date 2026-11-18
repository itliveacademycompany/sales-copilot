# Facebook Lead Ads — Make orqali (asosiy usul)

```
Meta Instant Form ──▶ Make: Facebook Lead Ads «New Lead» (+ «Get Lead Details»)
                  ──▶ Make: HTTP «Make a request»  POST + X-API-Key
                  ──▶ DealMind: /api/v1/webhooks/crm/make/<id>/leads
                  ──▶ CRM «Saralanmagan» (manba «Meta Lead Ads», yetkazib beruvchi «Make»)
```

Facebook'ga kirish, sahifa va formalarni tanlash, Meta ruxsatlari — **Make tomonida**.
DealMind Meta App ID, App Secret, Configuration ID, Page token yoki Verify token
**so'ramaydi** va Meta'ga so'rov yubormaydi: faqat Make yuborgan tayyor lidni qabul qiladi.

> Make scenario'sini DealMind yaratmaydi va yoqmaydi. Hammasi Make saytida qo'lda
> bajariladi (6-bo'lim). DealMind faqat URL va API kalitini beradi.

Bevosita Meta ulanishi (kompaniyaning o'z Meta ilovasi, `docs/meta-lead-ads.md`) o'zgarmagan —
kartada alohida «Bevosita Meta ulanishi» bo'limida. Bitta lid ikkala yo'ldan kelsa ham CRM'da bitta bo'ladi.

---

## 1. DealMind'da: URL va kalit

CRM → Integratsiyalar → **Facebook Lead Ads** → **Make orqali ulash** → **Qabul qilish URL'ini yaratish**.

| Ko'rinadi | Izoh |
|---|---|
| Qabul qilish URL'i | `https://<domen>/api/v1/webhooks/crm/make/<integratsiya-id>/leads` |
| API kaliti | `dm_mk_…` — **faqat bir marta** ko'rsatiladi; serverda faqat SHA-256 xeshi |
| Holatlar | «URL yaratildi» → «Test request qabul qilindi» → «Haqiqiy Meta lidi qabul qilindi» |
| Oxirgi lid, soni, oxirgi xato | Xato matnida kalit, ism yoki telefon bo'lmaydi |
| Kalitni almashtirish | Eski kalit **darhol** ishlamay qoladi — Make keychain'ini yangilang |
| Integratsiyani o'chirish | URL va kalit ishlamay qoladi; kelgan lidlar CRM'da qoladi |

Faqat `integration:manage` huquqi borlar (ega, rahbar) yarata, almashtira va o'chira oladi.
**«URL yaratildi» — integratsiya ishlayapti degani emas.** Haqiqiy lid kelguncha karta sariq turadi.

---

## 2. Endpoint

```
POST /api/v1/webhooks/crm/make/<integratsiya-id>/leads
Content-Type: application/json
X-API-Key: dm_mk_…
```

- Tenant URL'dagi integratsiya + kalit orqali aniqlanadi. Tanadagi `tenant_id`,
  `organization_id` va boshqa noma'lum maydonlar **e'tiborsiz** qoldiriladi.
- Kalit faqat `X-API-Key` sarlavhasida. Query'dagi kalit (`?api_key=`) qabul qilinmaydi.
- Bu Meta webhook'i emas: `hub.challenge`, Verify token va `X-Hub-Signature-256` yo'q.
- Tana ≤ 64 KB. Limit — har integratsiya uchun daqiqasiga 600 so'rov. Make so'rovlari umumiy IP manzillardan keladi, shuning uchun limit IP bo'yicha emas.
- Javob lid bazaga yozilgandan (tranzaksiya yakunlangach) keyin qaytadi.

| Status | Tana | Qachon |
|---|---|---|
| **201** | `{"status":"created","lead_id":"<uuid>"}` | Yangi lid «Saralanmagan»ga tushdi |
| **200** | `{"status":"duplicate","lead_id":"<uuid>"}` | Bu `external_lead_id` oldin qabul qilingan (qayta urinish/parallel) — yangi lid YO'Q |
| **200** | `{"status":"test_ok"}` | `"test": true` — payload to'g'ri, lid yaratilmadi |
| 400 | — | JSON buzilgan |
| 401 | `{"error":"unauthorized"}` | Kalit yo'q / noto'g'ri / almashtirilgan / integratsiya o'chirilgan |
| 413 | — | Tana 64 KB dan katta |
| 415 | — | `Content-Type` JSON emas |
| 422 | `{"error":"invalid_payload","details":[{"field","message"}]}` | Maydon turi yoki majburiy maydon xato (qiymatlar qaytarilmaydi) |
| 429 | — | Limit oshdi |
| 500 | `{"error":"server_error"}` | Saqlab bo'lmadi — qayta yuboring (dubl bo'lmaydi) |

**Idempotentlik:** `crm_inbox` dagi `(business_id, source, external_id)` unikal kaliti
(`source = meta_lead_ads`, `external_id = lead:<external_lead_id>`) va advisory qulf.
Telefon dedup kaliti EMAS — bir xil telefonli ikki lid ikkita murojaat bo'ladi.

---

## 3. Payload kontrakti

```json
{
  "external_lead_id": "1234567890123456",
  "full_name": "Aziza Karimova",
  "phone_number": "+998901234567",
  "email": "aziza@example.com",
  "page_id": "102030405060708",
  "page_name": "Sahifa nomi",
  "form_id": "900800700600500",
  "form_name": "Forma nomi",
  "ad_id": "120200000000001",
  "ad_name": "Reklama nomi",
  "adset_id": "120200000000002",
  "adset_name": "To'plam nomi",
  "campaign_id": "120200000000003",
  "campaign_name": "Kampaniya nomi",
  "platform": "ig",
  "is_organic": false,
  "created_time": "2026-11-18T10:00:00+0000",
  "custom_fields": { "qaysi_kurs_sizni_qiziqtiradi?": "Frontend" },
  "test": false
}
```

| Maydon | Tur | Izoh |
|---|---|---|
| `external_lead_id` | string (majburiy) | Meta lead ID. 1–64 belgi: harf, raqam, `_ . : -` |
| `full_name`, `phone_number`, `email` | string | Ixtiyoriy. Telefon normallashtiriladi (`+998…`), asl qiymat `phoneRaw` da saqlanadi. Noto'g'ri email kontaktga yozilmaydi (`emailRaw`) |
| `page_id`, `form_id`, `ad_id`, `adset_id`, `campaign_id` | string | Har doim **matn** sifatida saqlanadi. Raqam faqat xavfsiz butun son bo'lsa qabul qilinadi — katta Meta ID JSON raqamida aniqligini yo'qotadi, shuning uchun 422 |
| `page_name`, `form_name`, `ad_name`, `adset_name`, `campaign_name` | string | ≤ 300 |
| `platform` | string | `fb`/`facebook`/`ig`/`instagram`. Kelmasa — **noma'lum** (Instagram deb taxmin qilinmaydi) |
| `is_organic` | boolean | |
| `created_time` | string (ISO) yoki unix soniya | Noto'g'ri bo'lsa — e'tiborsiz |
| `custom_fields` | `{ "savol": "javob" }` yoki Meta `field_data`: `[{ "name", "values": [] }]` | ≤ 100 ta; murojaat matniga "Savol: javob" va `payload.values` ga |
| `test` | boolean | `true` — faqat tekshiruv, CRM lid yaratilmaydi |

Bo'sh qiymatlar (`""`, `null`) — "yo'q" deb olinadi, xato bermaydi. Ism yoki telefon bo'lmasa ham lid yaratiladi.

---

## 4. Make'da sozlash (qo'lda, Make saytida)

Manbalar: [apps.make.com/facebook-lead-ads](https://apps.make.com/facebook-lead-ads),
[apps.make.com/http](https://apps.make.com/http), [apps.make.com/api-key-authentication-type](https://apps.make.com/api-key-authentication-type),
[help.make.com/incomplete-executions](https://help.make.com/incomplete-executions).

### 4.1. Meta: Make'ga lidlarga kirish huquqi

Meta Business Settings → **Integrations → Leads Access** → sahifa (bizning birinchi
ulanishda: ITlive OQUV Markazi) → **CRMs → Assign CRMs** → **Make** ni belgilang → Assign.
Busiz Make lid ma'lumotini ololmaydi.

### 4.2. Scenario

1. Make → **Create a new scenario** → **Facebook Lead Ads → New Lead**.
2. **Create a webhook** → **Create a connection** → Make'ning **standart** Facebook ulanishi
   (*Show advanced settings* dagi o'z client ID/secret **kerak emas**) → Facebook'da ruxsat bering.
3. Sahifa va formani tanlang. Make: forma kamida bir marta to'ldirilgan bo'lishi kerak, aks holda modulda chiqmaydi.
4. Lid javoblari (`field_data`), forma/reklama nomlari trigger chiqishida bo'lmasa — keyingi modul
   **Facebook Lead Ads → Get Lead Details** (Lead ID = New Lead'dan).
5. **HTTP → Make a request**:
   - **URL**: DealMind kartasidagi qabul qilish URL'i; **Method**: POST.
   - **Authentication type**: API key → **Credentials** → Add:
     *Key* = DealMind API kaliti, *API key placement* = **In the header**,
     *API key parameter name* = **x-api-key**. *Restrict requests to service URLs*
     yoqilgan bo'lsa — *Allowed service origins*: `https://<domen>`.
     (Kalitni Headers yoki URL'ga yozmang.)
   - **Body content type**: application/json; **Body input method**: **Data structure**
     (Make qiymatlardagi JSON belgilarini o'zi escape qiladi; *JSON string* tanlansa — qo'lda escape kerak).
     Data structure'ni 3-bo'limdagi namunadan **Generate** bilan yarating, `custom_fields`
     uchun field_data ni moslang. ID larni **text** sifatida moslang.
   - **Return error if HTTP request fails**: Yes. **Timeout**: 30–60.
6. Xatolar va qayta urinish: Scenario settings → **Store incomplete executions** — yoqing
   (standart o'chiq). HTTP moduliga xato ishlovchisi qo'shing (Make'ning qayta urinish
   imkoniyatlari, masalan *Retry*). 5xx va 429 — vaqtinchalik, qayta yuboring; 401 va 422 —
   sozlashni tuzating (qayta yuborish yordam bermaydi). Takroriy yuborish dubl yaratmaydi (200 duplicate).

### 4.3. Tekshirish va yoqish

1. Data structure'da `test` = **true** → **Run once** → DealMind kartasida **«Test request qabul qilindi»**.
   (Run once trigger'dan namunaviy lid kutishi mumkin — kerak bo'lsa HTTP modulini alohida ishga tushiring.)
2. `test` ni olib tashlang yoki **false** qiling → scenario'ni **ON** qiling.
3. [Lead Ads Testing Tool](https://developers.facebook.com/tools/lead-ads-testing): sahifa va formani tanlang → **Create lead**.
4. DealMind: **«Haqiqiy Meta lidi qabul qilindi»** yashil, lid «Saralanmagan»da (manba Meta Lead Ads · Make orqali).

Scenario o'chirilsa ham sahifa Make'ning Facebook obunasidan avtomatik chiqmaydi — kerak bo'lsa
Make'dagi **Unsubscribe a Webhook** modulidan foydalaning.

---

## 5. Kod va tekshiruv

- `backend/src/crm/metaLeadAds/make.ts` — kalit, payload, qabul qilish, boshqaruv
- `backend/src/http/routes/make-leads.ts` — marshrutlar
- `backend/drizzle/0036_make_lead_intake.sql` — jadval (kalit xeshi) + RLS
- `frontend/src/pages/crm/MetaLeadAds.tsx` — «Make orqali ulash» bo'limi

```bash
npm run verify:make-leads --prefix backend
```

Mock test (bazasiz): kalit, tenant ajratilishi, payload turlari va o'lchami, ixtiyoriy
maydonlar, takroriy va parallel so'rov, test so'rovi, HTTP statuslar. Haqiqiy Make + Meta
sinovi — 4.3 bo'yicha alohida.
