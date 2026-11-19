# Meta formalari va Conversions API

Lid kelgandan keyingi ikki qadam — Facebook Lead Ads integratsiyasining davomi
([meta-lead-ads.md](meta-lead-ads.md), [make-lead-ads.md](make-lead-ads.md)):

1. **Formalar** — har bir Instant Form uchun: qaysi voronka va bosqichga tushadi,
   savollar qaysi kontakt yoki bitim maydoniga yoziladi, qanday teg va manba qo'yiladi,
   bitim darhol yaratiladimi va mas'ul navbat bilan tayinlanadimi.
2. **Conversions API (CAPI)** — bitim belgilangan bosqichga kirganda Meta'ga hodisa
   (`Lead`, `Purchase`, …) yuboriladi. Reklama shunda «forma to'ldirgan»ga emas,
   «sifatli lid / to'lov qilgan»ga optimallashadi.

Ikkalasi ham CRM → Integratsiya → «Facebook Lead Ads» kartasining pastida, ikkita
ochiladigan bo'limda. Ular **Make yo'li uchun ham, bevosita Meta ulanishi uchun ham** bir
xil ishlaydi: ikkala yo'l ham bitta joydan — `metaLidiniYoz` (`crm/metaLeadAds/ishlov.ts`)
orqali o'tadi.

Huquq: `integration:manage` (ega va rahbar).

---

## 1. Formalar

### Forma qanday paydo bo'ladi

Formani qo'lda qo'shish shart emas. Formadan **birinchi lid** kelganda u o'zi ro'yxatga
tushadi: nomi, sahifa nomi va savollar ro'yxati shu lid bilan birga keladi. Keyingi
lidlarda yangi savol bo'lsa, ro'yxatga qo'shiladi. Forma nomi Meta'da o'zgarsa, kalit
o'zgarmaydi — kalit **forma ID**, nom emas (bir xil nomli ikki forma aralashmaydi).

Sozlama faqat **keyingi** lidlarga ta'sir qiladi. Avval kelgan lidlar o'zgarmaydi.

### Sozlamalar

| Sozlama | Nima qiladi |
|---|---|
| Voronka | Bo'sh qoldirilsa, ulanish (Make yoki sahifa) sozlamasidagi voronka ishlatiladi |
| Bosqich | Faqat avto-taqsimot yoqilganda. Bo'sh qoldirilsa, voronkaning birinchi ochiq bosqichi tanlanadi |
| Savollar → CRM | `Kontakt: ism / telefon / email`, istalgan **bitim maydoni** yoki «Izohga» |
| Teglar | Bitimga qo'yiladi (vergul bilan ajratiladi) |
| Manba nomi | Bo'sh qoldirilsa, forma nomi olinadi |
| Avto-taqsimot | Lid «Saralanmagan»da kutmaydi: bitim darhol yaratiladi, mas'ul tayinlanadi |
| Mas'ullar navbati | Tanlanganlar orasida haqiqiy round-robin (faol emaslar o'tkazib yuboriladi). Hech kim tanlanmasa, CRM'ning umumiy navbati ishlaydi |

### Savollarni avtomatik aniqlash

Xaritada ko'rsatilmagan savollar uchun quyidagicha taxmin qilinadi:

- telefonga o'xshash kalit (`phone`, `telefon`, `raqam`, `nomer`, …) va qiymat haqiqiy telefon
  bo'lsa → telefon;
- qiymat email bo'lsa → email;
- ismga o'xshash kalit (`name`, `ism`, `ismingiz`, `fio`, `имя`, …) → ism.

Shuning uchun o'zbekcha maxsus savollar («Ismingiz?», «Telefon raqamingiz?») ham to'g'ri
tushadi. Avval bunday savollar faqat izohga yozilar, murojaat esa ism va telefonsiz qolardi.

Hamma javoblar xaritadan qat'i nazar izohda ham saqlanadi.

---

## 2. Conversions API

### Ulash

Events Manager → Data sources → dataset (Pixel) → Settings → Conversions API →
**Generate access token**. Kartaga kiritiladi:

- **Dataset (Pixel) ID**;
- **Access token**. Saqlashdan oldin Meta'da tekshiriladi (`GET /{dataset}`), keyin
  shifrlangan holda saqlanadi va javobda hech qachon qaytmaydi (faqat `…abcd` ko'rinishidagi
  maska);
- **Test event code** (ixtiyoriy). Kiritilsa, hodisalar Events Manager → Test events'da
  ko'rinadi va reklamaga ta'sir qilmaydi.

### Qoidalar

Qoida — «voronka → bosqich → Meta hodisasi». Masalan:

| Bosqich | Hodisa | Summa |
|---|---|---|
| Sifatli lid / Uchrashuvga yozildi | `Lead` (yoki `QualifiedLead`) | yo'q |
| Muvaffaqiyatli (to'lov) | `Purchase` | ha, bitim summasi |

> **To'lov bosqichi uchun `Lead` tanlamang.** Aks holda Meta to'lovni yangi lid deb
> hisoblaydi va optimallashtirish buziladi. Interfeys bunday holatda ogohlantiradi.

Qoida **qo'shilgan paytdan boshlab** ishlaydi. Undan oldin bosqichga kirgan bitimlar
orqaga qarab yuborilmaydi. Shu sababli qoida qo'shilganda tarixdagi yuzlab bitim birdan
Meta'ga ketib qolmaydi. Meta 7 kundan eski hodisani qabul qilmaydi, bu chegara ham
hisobga olingan.

### Qanday yuboriladi

Worker har 20 soniyada ikki ishni bajaradi (`jobs/worker.ts`):

1. `capiNavbatgaQoy` — qoidalarga mos `deal_event` (`stage`, `created`) yozuvlarini
   `meta_capi_event` navbatiga qo'shadi. Har (qoida, bosqich hodisasi) jufti faqat bir marta
   qo'shiladi (unikal kalit).
2. `capiYubor` — navbatdagilarni `POST /{dataset}/events` orqali yuboradi:
   - `action_source: system_generated`, `custom_data.event_source: crm`,
     `lead_event_source: Deal Mind`;
   - `event_id = dm.<deal_event>.<qoida>` — Meta tomonida takror hisoblanmaydi;
   - `user_data`: telefon, email, ism, familiya va `external_id` — **faqat SHA-256 xeshi**;
     Lead Ads'dan kelgan bitimlarda `lead_id` (Meta lead ID) ham qo'shiladi. Bu eng aniq
     moslash usuli;
   - `Purchase` va «summani yuborish» yoqilgan bo'lsa: `value` va `currency` (standart `UZS`).

### Jurnal va holatlar

Kartada so'nggi 30 kun hisobi va oxirgi 50 hodisa ko'rinadi.

| Holat | Sabab |
|---|---|
| yuborildi | Meta qabul qildi (`events_received`, `fbtrace_id` saqlanadi) |
| o'tkazildi | `not_configured` (CAPI ulanmagan), `disabled` (o'chirilgan), `no_contact` (telefon, email va lead ID yo'q), `too_old` (7 kundan eski) |
| xato | Doimiy xato (masalan, token bekor qilingan). Kartadagi ulanish holati «xato»ga o'tadi va Meta xabari ko'rsatiladi |

Vaqtinchalik xatolar (tarmoq, 5xx, limit) avtomatik qayta urinadi: kechikish ortib boradi,
eng ko'pi 6 urinish. **«Qayta yuborish»** tugmasi o'tkazilgan va xato hodisalarni
(7 kun ichidagilarni, `no_contact` dan tashqari) qayta navbatga qo'yadi. Masalan, token
almashtirilgandan keyin shu tugma bosiladi.

Har bir hodisaning holati alohida saqlanadi. Shu sababli obuna tugashi yoki token
eskirishi «jimgina» o'tib ketmaydi: sabab jurnalda ko'rinadi va hodisalarni qayta yuborish
mumkin.

---

## 3. API

| Usul | Yo'l | |
|---|---|---|
| GET | `/api/v1/businesses/:id/meta-lead-ads/forms` | formalar + CRM maydonlari |
| PUT | `/api/v1/businesses/:id/meta-lead-ads/forms/:formaId` | voronka, bosqich, xarita, teg, manba, avto-taqsimot |
| GET | `/api/v1/businesses/:id/meta-capi` | sozlama (tokensiz), qoidalar, holatlar, jurnal |
| PUT | `/api/v1/businesses/:id/meta-capi` | dataset + token (Meta'da tekshiriladi) |
| DELETE | `/api/v1/businesses/:id/meta-capi` | uzish (qoidalar va jurnal qoladi) |
| POST | `/api/v1/businesses/:id/meta-capi/rules` | qoida qo'shish (takror qoida bo'lsa — 409) |
| PATCH / DELETE | `/api/v1/businesses/:id/meta-capi/rules/:qoidaId` | yoqish/o'chirish, summa; o'chirish |
| POST | `/api/v1/businesses/:id/meta-capi/resend` | o'tkazilgan/xato hodisalarni qayta navbatga qo'yish |

Jadvallar (migratsiya `0037_meta_form_capi.sql`, hammasi RLS ostida): `meta_form_setting`,
`meta_capi_config`, `meta_capi_rule`, `meta_capi_event`.

---

## 4. Tekshiruv

```bash
npm run verify:meta-forma-capi --prefix backend
```

Test haqiqiy baza va HTTP bilan ishlaydi, Meta o'rnida soxta Graph server turadi. Dev
server **to'xtatilgan** bo'lishi kerak, aks holda uning worker'i navbatni test bilan bir
vaqtda olib qo'yadi.

Tekshiriladi:

- xarita va taxmin;
- CAPI tanasi va xesh;
- forma o'zi ro'yxatga tushishi;
- sozlamalar validatsiyasi (boshqa voronka bosqichi, yo'q maydon yoki mas'ul);
- avto-taqsimot va round-robin;
- teg va manba;
- dublikat;
- token tekshiruvi;
- tarix himoyasi;
- yuborish va idempotentlik;
- `no_contact`;
- 503 da qayta urinish, doimiy token xatosi, «Qayta yuborish»;
- Make statistikasi;
- **bevosita Meta webhook yo'li worker orqali, oxirigacha**.
