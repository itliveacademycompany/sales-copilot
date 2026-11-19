# Facebook Lead Ads: "Facebook orqali ulash"

Meta Instant Form lidlari (Facebook va Instagram reklamasidagi lid formalari)
CRM'ning **«Saralanmagan»** ustuniga o'zi tushadi.

**SaaS: har kompaniya o'z Meta ilovasini saytning o'zida kiritadi.** CRM →
Integratsiyalar → «Facebook Lead Ads» kartasi → **Meta ilovasi → Sozlash**: App ID,
App Secret, Configuration ID. Server env'ga tegilmaydi. Verify token va kompaniyaning
alohida webhook manzili kartada ko'rsatiladi — ular Meta paneliga nusxalanadi.
Kalitlar saqlashdan oldin Meta'da tekshiriladi, App Secret shifrlangan holda saqlanadi.
Shundan keyin rahbar «Facebook orqali ulash» bilan sahifa va formalarni tanlaydi.

| Variant | Qayerda kiritiladi | Webhook manzili |
|---|---|---|
| **Kompaniya ilovasi** (asosiy) | Kartada, har kompaniya o'zi | `/api/v1/webhooks/crm/meta-app/<id>` — kompaniyaga alohida |
| Platforma ilovasi (zaxira) | Server env (`META_*`, 4-bo'lim) | `/api/v1/webhooks/crm/meta` |

Kompaniya ilovasi kiritilgan bo'lsa — u ishlatiladi, aks holda platforma ilovasi (agar env
bo'lsa). Kompaniya o'z sahifalarini o'z ilovasi orqali ulasa (ulaydigan odam ilovada
Admin/Tester), Meta **App Review talab qilmaydi** — 3.4-bo'lim.

Bu hujjat Meta panelida bir martalik sozlash va sinov tartibi uchun. Quyidagi 3-bo'limdagi
manzillar kartada tayyor holda chiqadi (kompaniya ilovasi uchun webhook manzili —
`/meta-app/<id>`).

> Bu Instagram Direct yoki Messenger chatlari haqida **emas**: ular qo'lda ulanadi
> (Saralanmagan → Facebook/Instagram ikoni → kalitlar) va bu tartib o'zgarmagan.
>
> Lid kelgandan keyingi qadamlar alohida hujjatda: forma bo'yicha voronka, savol → maydon,
> teg, avto-taqsimot hamda natijani Meta'ga qaytarish (Conversions API) —
> [meta-forma-capi.md](meta-forma-capi.md).

---

## 1. Qanday ishlaydi

```
Rahbar: CRM → Integratsiyalar → «Facebook orqali ulash»
  → Meta ruxsat oynasi (Facebook Login for Business)
  → GET /api/v1/crm/oauth/meta/callback      ← OAuth redirect URI
  → sahifa tanlash → Instant Form'larni tanlash → «Ulash»
      server: sahifani ilova webhook'iga obuna qiladi (POST /{page-id}/subscribed_apps, leadgen)

Mijoz reklamadagi formani to'ldiradi
  → Meta: POST /api/v1/webhooks/crm/meta      ← Webhook callback URL
      server: imzo tekshiriladi → hodisa bazaga yoziladi → 200 (tez)
  → worker: GET /{leadgen-id} (sahifa tokeni bilan) → «Saralanmagan», manba «Meta Lead Ads»
```

**Ikki URL — ikki xil vazifa:**

| | OAuth redirect URI | Webhook callback URL |
|---|---|---|
| Yo'l | `/api/v1/crm/oauth/meta/callback` | `/api/v1/webhooks/crm/meta` |
| Kim chaqiradi | Foydalanuvchining brauzeri (Meta oynasidan qaytish) | Meta serveri (lid kelganda) |
| Qachon | Faqat ulashda, bir marta | Har lidda |
| Meta panelida | Facebook Login for Business → Settings → Valid OAuth Redirect URIs | Webhooks → Page → Callback URL |
| Tekshiruv | bir martalik `state` (serverda, 15 daqiqa) | `X-Hub-Signature-256` (App Secret) |

---

## 2. Talab: HTTPS domen

Meta OAuth redirect va webhook'ni faqat **HTTPS** (haqiqiy sertifikat) manzilga
yuboradi. Server hozir IP orqali HTTP'da ishlasa — avval domen ulang
(`docs/deploy.md`: `SITE_ADDRESS`, `WEB_ORIGIN`) va `PUBLIC_URL=https://<domen>` qo'ying.
Domensiz kod tayyor turadi, lekin Meta bilan ulanib bo'lmaydi.

---

## 3. Meta panelida bir martalik sozlash

Quyida `https://crm.example.uz` — sizning `PUBLIC_URL`ingiz.

### 3.1. Ilova

1. [developers.facebook.com](https://developers.facebook.com) → My Apps → **Create app**.
   Turi: **Business** (yoki Facebook Login for Business'ni qo'llaydigan use case).
   Ilova sizning (operator) **Business portfolio**ngizga biriktirilsin.
2. App settings → Basic:
   - **App ID** → `META_APP_ID`, **App secret** → `META_APP_SECRET`;
   - **App Domains**: `crm.example.uz`;
   - **Privacy Policy URL** va **Terms of Service URL** — ommaviy sahifalar (Live rejim va App Review uchun majburiy);
   - **User data deletion** → *Data deletion callback URL*: `https://crm.example.uz/api/v1/webhooks/crm/meta/data-deletion`.
3. Mahsulotlar: **Facebook Login for Business**, **Webhooks**. Lidlar uchun **Marketing API**
   (`leads_retrieval`, `ads_management` ruxsatlari shu orqali).

### 3.2. Facebook Login for Business

1. Settings:
   - **Valid OAuth Redirect URIs**: `https://crm.example.uz/api/v1/crm/oauth/meta/callback`
     (`META_OAUTH_REDIRECT_URI` berilgan bo'lsa — aynan o'sha);
   - **Enforce HTTPS** va **Use Strict Mode for redirect URIs** — yoqilgan;
   - **Deauthorize callback URL**: `https://crm.example.uz/api/v1/webhooks/crm/meta/deauthorize`.
2. **Configurations → Create configuration**:
   - Token turi: **User access token** (System-user token — Tech Provider talab qiladi, bu oqimda ishlatilmaydi);
   - Assets: **Pages**;
   - Permissions: `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`,
     `leads_retrieval`, `pages_manage_ads`, `ads_management`;
   - **Configuration ID** → `META_LOGIN_CONFIG_ID`.

   `META_LOGIN_CONFIG_ID` bo'lmasa kod klassik `scope` parametri bilan ishlaydi
   (`META_OAUTH_SCOPES` bilan o'zgartirish mumkin). Tavsiya — konfiguratsiya.

**Ruxsatlar nima uchun** (Meta Lead Ads hujjatidagi endpointlar bo'yicha):

| Ruxsat | Nima uchun |
|---|---|
| `pages_show_list` | Foydalanuvchi boshqaradigan sahifalar (`/me/accounts`) |
| `pages_read_engagement` | Sahifa ma'lumoti (dependency) |
| `pages_manage_metadata` | Sahifani webhook'ga obuna qilish (`/{page-id}/subscribed_apps`) |
| `leads_retrieval` | Lid ma'lumoti (`/{leadgen-id}`, `/{form-id}/leads`) |
| `pages_manage_ads` | Sahifaning Instant Form'lari (`/{page-id}/leadgen_forms`); App Review'da majburiy |
| `ads_management` | Lidning reklama/kampaniya ID lari va leadgen obunasi (Meta ro'yxatida) |

`business_management` **so'ralmaydi**. Agar mijozning sahifasi faqat Business portfolio
orqali berilgan bo'lib, `/me/accounts` bo'sh qaytsa (ekranda "Ruxsat berilgan Facebook
sahifasi topilmadi") — konfiguratsiyaga `business_management` qo'shing va App Review'da
asosiy ruxsat (`leads_retrieval`) bilan birga asoslang. Instagram va Messenger ruxsatlari kerak emas.

### 3.3. Webhooks

1. Webhooks → obyekt **Page** → *Subscribe to this object*:
   - Callback URL: `https://crm.example.uz/api/v1/webhooks/crm/meta`
   - Verify token: `META_WEBHOOK_VERIFY_TOKEN` qiymati
   - **Verify and save** (server shu paytda `hub.challenge` ni qaytaradi — backend env bilan ishlab turgan bo'lishi kerak).
2. Maydonlar ro'yxatida **`leadgen`** ga obuna bo'ling.

Kompaniya ilovasida Callback URL va Verify token kartadan olinadi (`/meta-app/<id>`) —
Verify token kalitlarni saqlashdan oldin ham ishlaydi. Bu — ilova darajasidagi obuna. Sahifa darajasidagi
obunani tizim har «Ulash»da o'zi qiladi va Meta javobini (`success: true`) tekshiradi.
Meta hodisani faqat ikkala obuna ham bo'lsa yuboradi.

### 3.4. Access level, App Review, Business Verification

| Rejim | Kim ulay oladi |
|---|---|
| **Development** | Faqat ilovada roli bor odamlar (Admin / Developer / Tester) va ular boshqaradigan sahifalar. Meta hujjatiga ko'ra Development rejimida lidlarni olish va Lead Ads Testing Tool cheklangan — haqiqiy sinov uchun Live rejim kerak bo'lishi mumkin. |
| **Live + Standard Access** | Hali ham faqat ilova rolidagi odamlar va sizning portfelingiz aktivlari. |
| **Live + Advanced Access** | Istalgan tashkilot. **App Review** (yuqoridagi ruxsatlar, ayniqsa `leads_retrieval` va `pages_manage_ads`; `public_profile` uchun ham Advanced Access) va **Business Verification** talab qilinadi. |

Xulosa: o'z sahifangiz (ITlive) bilan sinash uchun — ulaydigan odamni ilovaga Admin/Tester
qilib qo'shish yetarli; boshqa mijozlarga ochish uchun — App Review + Business Verification.

### 3.5. Leads Access Manager (mijoz tomonida)

Meta Business Suite → Settings → **Integrations → Leads Access**.
Agar tashkilot lidlarga kirishni sozlagan (cheklagan) bo'lsa — **shu ilovani (CRM)** va
**ulagan foydalanuvchini** ro'yxatga qo'shish shart. Aks holda token ishlaydi, lekin lid
o'qilmaydi: interfeysda "Lidlarni o'qishga huquq yo'q…" xabari va «Holatni tekshirish»
da *Lidlarni o'qish (Leads Access)* qadami qizil bo'ladi. Sozlanmagan bo'lsa — sahifaning
barcha adminlari kirish huquqiga ega.

Ulaydigan odamning sahifada **Advertise** (yoki to'liq boshqaruv) huquqi bo'lishi kerak.

---

## 4. Server env — faqat platforma ilovasi uchun (ixtiyoriy)

Kompaniyalar o'z ilovasini kartada kiritsa, env **kerak emas**. Env — o'z ilovasi
bo'lmagan kompaniyalar uchun umumiy zaxira ilova.

`/opt/sotuv/.env` (namuna: `deploy/.env.example`, `backend/.env.example`):

```
PUBLIC_URL=https://crm.example.uz
META_APP_ID=...
META_APP_SECRET=...
META_LOGIN_CONFIG_ID=...
META_GRAPH_API_VERSION=v24.0          # ixtiyoriy; bo'sh — META_GRAPH_VERSION yoki v23.0
META_WEBHOOK_VERIFY_TOKEN=...         # kamida 16 belgi, tasodifiy
# META_OAUTH_REDIRECT_URI=...         # ixtiyoriy; bo'sh — ${PUBLIC_URL}/api/v1/crm/oauth/meta/callback
```

`META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` dan biri bo'lmasa — oddiy
foydalanuvchi "Integratsiya hali sozlanmagan" ko'radi, super admin esa yetishmayotgan
env nomlari va ikkala URL ni ko'radi. Env o'zgargach backend konteynerini qayta ishga tushiring.

**Migratsiyalar:** `0034_meta_lead_ads.sql` (3 jadval) va `0035_meta_app_config.sql`
(kompaniya ilovasi) — idempotent, backend konteyneri ishga tushganda avtomatik
qo'llanadi; RLS `rls.sql` da.

---

## 5. Lead Ads Testing Tool bilan sinov

1. Env qo'yilgan, ilova sozlangan, webhook *Verify and save* muvaffaqiyatli.
2. CRM → Integratsiyalar → **Facebook orqali ulash** → Meta oynasida sahifani tanlang →
   qaytgach sahifa va formalarni tanlang → **Ulash**. Kartada "Ulandi" yashil,
   "Hali lid kelmagan" sariq bo'ladi.
3. **Holatni tekshirish** — token, ruxsatlar, webhook obunasi, formalar va Leads Access qadamlari yashil bo'lsin.
4. [developers.facebook.com/tools/lead-ads-testing](https://developers.facebook.com/tools/lead-ads-testing):
   sahifa va **tanlangan** formani tanlang → **Create lead** → **Track status**.
   Status `success` bo'lishi kerak (payload shu yerda ko'rinadi).
   Bitta formaga bitta test lid — yangisidan oldin eskisini o'chiring (*Delete lead*).
5. Bir necha soniyada lid **Saralanmagan**da paydo bo'ladi: manba "Meta Lead Ads",
   sahifa nomi, forma, javoblar. Kartada "Lid qabul qilindi" yashil bo'ladi.
6. Tanlanmagan forma bilan test lid — CRM'ga tushmasligi kerak (kartada
   "N ta tanlanmagan formadan (kiritilmadi)").

Test lidlar organik — reklama/kampaniya ID lari bo'lmaydi; bu normal.

Agar lid kelmasa:

| Belgi | Sabab |
|---|---|
| Testing Tool: `failed` | Webhook URL HTTPS emas, server javob bermadi yoki imzo rad etildi (backend logi: `meta lead ads webhook: imzo mos kelmadi` — App Secret noto'g'ri) |
| `success`, lekin kartada "Olinmagan lidlar" | Graph xatosi: Leads Access, ruxsat yoki token — xabarda sabab; tuzatgach **Qayta ishlash** |
| Webhook umuman kelmaydi | App Dashboard'da `leadgen` maydoni obuna qilinmagan yoki sahifa obunasi yo'q («Holatni tekshirish» qayta obuna qiladi) |

---

## 6. Xavfsizlik va ishonchlilik qarorlari

- **State** — 32 bayt tasodifiy, bazada faqat SHA-256 xeshi, foydalanuvchi + tashkilot +
  qaytish manziliga bog'langan, 15 daqiqa, bir martalik (`UPDATE … WHERE used_at IS NULL`).
  Tenant callback query'sidan emas, server sessiyasidan olinadi.
- **Qaytish manzili** — faqat shu tashkilotning o'z manzili (open redirect yo'q).
- **code → token** — serverda; uzoq muddatli user token olinadi, undan sahifa tokeni.
  Sahifa tokeni AES-256-GCM bilan shifrlangan, javobda hech qachon qaytmaydi; Meta muddat
  bermasa "abadiy" deb ko'rsatilmaydi — bekor qilinishi `190` xatosi va deauthorize orqali kuzatiladi.
- **Sahifa tanlash** — sahifa aynan shu OAuth sessiyasida berilgani, sessiya shu odam va shu
  tashkilotniki ekani serverda tekshiriladi.
- **Bitta sahifa — bitta tashkilot** (faol ulanish, DB unikal indeksi). Boshqa tashkilotga
  ulangan sahifa egallanmaydi; foydalanuvchi faqat "boshqa tashkilotga ulangan" xabarini ko'radi.
- **Webhook** — imzo xom tana bo'yicha; hodisa bazaga yozilgandan keyin 200; batch'dagi barcha
  entry/change; `(business_id, leadgen_id)` unikal; CRM yozuvi advisory qulf + `crm_inbox`
  unikal kaliti bilan — takroriy/parallel hodisa bitta lid beradi. Qo'lda ulash yo'li bilan
  bir xil lid ikki marta tushmaydi.
- **Forma filtri** backend'da (webhook'da ham, worker'da ham, Graph'dagi forma bo'yicha ham).
- **Retry** — vaqtinchalik xato/limit: 30s → 90s → … (6 urinish), keyin "Olinmagan lidlar";
  token/ruxsat xatosi — `auth_wait`, qayta ulanganda avtomatik navbatga qaytadi.
- **Uzish** — faqat shu tashkilot ulanishi; sahifa obunasi faqat boshqa faol ulanish yo'q
  bo'lsa olib tashlanadi; foydalanuvchining Facebook ruxsatlari global bekor qilinmaydi.
- **Loglar** — token, App Secret, OAuth code va lidning shaxsiy ma'lumoti loglanmaydi
  (faqat ID lar va sonlar). Graph xato matnidan token ko'rinishidagi qismlar olib tashlanadi.
- **Data deletion** — FB foydalanuvchisi tokenlari va ID si o'chiriladi, ulanish uziladi.
  CRM'dagi lidlar reklama beruvchi tashkilotning ma'lumoti — ular o'chirilmaydi.

---

## 7. Tekshiruvlar

```bash
npm run verify:meta-lead-ads --prefix backend
```

**Mock test (bazasiz, soxta Meta server):** imzo, signed_request, state (yaroqsiz,
eskirgan, takrorlangan), tenantlar orasidagi ruxsatsiz sahifa tanlash, qaytish manzili,
batch tahlili, forma filtri, takroriy va parallel hodisa, token bekor qilinishi,
vaqtinchalik xato va limit, Leads Access, xato matnida token yo'qligi, sahifalash.

Bu **end-to-end emas**: haqiqiy Meta ilovasi, sahifa va Testing Tool bilan sinov —
5-bo'limdagi tartib bo'yicha, domen va Meta sozlamalari tayyor bo'lgach alohida bajariladi.
Bazaga bog'liq kafolatlar (atomik state, unikal indekslar) SQL darajasida.
