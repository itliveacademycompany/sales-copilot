# AI Sotuv Intellekti

Sotuv bo'limining Telegram yozishmalarini yig'ib, kompaniyaning **o'z sotuv
skripti (playbook) bo'yicha** baholaydigan va kouching beradigan platforma.

O'zbekiston bozori uchun qurilgan: o'quv markazlari, klinikalar, konsalting,
logistika.

---

## Asosiy farqlanish — isbotli baholash

Ko'pchilik AI baholash tizimlari ball beradi va sabab sifatida modelning
o'z gapini keltiradi. Bu yerda boshqacha:

> **Har bir ball ortida transkriptdan olingan iqtibos turadi va o'sha
> iqtibosning haqiqatan mavjudligi KODDA tekshiriladi — promptda emas.**

Model iqtibos keltira olmasa yoki o'ylab topgan bo'lsa, ball `NULL`
("aniqlanmadi") bo'ladi va tahlil ko'rikka bayroqlanadi. Bu kelishuv emas,
ma'lumotlar bazasi darajasidagi kafolat:

```sql
CHECK (score IS NULL OR evidence_quote IS NOT NULL)
```

Interfeysda isbotga bosilsa — yozishmadagi aynan o'sha xabar ochiladi.
Bog'lanish ikki tomonlama: xabarning o'zida ham "qaysi bahoga asos
bo'lgani" ko'rinadi.

## Boshqa qarorlar

| Qaror | Sabab |
|---|---|
| **Telegram Bot API**, MTProto user-session emas | User-session sotuvchining barcha shaxsiy yozishmalariga kirish beradi. Bot faqat o'zi qo'shilgan joyni ko'radi — chegara aniq. |
| **Navbat Postgres'da**, Redis'siz | `FOR UPDATE SKIP LOCKED` + retry + DLQ. Bitta jarayon — bitta deploy. |
| **Row Level Security** bilan tenant izolyatsiyasi | Kodda `WHERE business_id` yozishni unutish xavfsiz: baza baribir begona qatorni qaytarmaydi. |
| **Playbook versiyalanadi**, joyida tahrirlanmaydi | Aks holda o'tgan oyning ballari bugungi mezon bo'yicha izohlanardi — tarix buzilardi. |
| Kodlar va vaznlarni LLM **tuzmaydi** | Aniq qoidali narsa deterministik kodda hisoblanadi. Model faqat mazmun beradi. |

## Stack

| Qatlam | Tanlov |
|---|---|
| Backend | TypeScript (ESM, Node 22+), Fastify 5, Drizzle, PostgreSQL 16+ |
| Frontend | React 18, Vite, TypeScript, React Router |
| Auth | argon2id, bitta noaniq sessiya tokeni (`httpOnly` cookie) |
| AI | Provayderdan mustaqil `LlmClient` — Anthropic va OpenAI-uyg'un API'lar |

## Ishga tushirish

```bash
cd backend && npm install && cp .env.example .env
```

`.env` da faqat `DATABASE_URL_ADMIN` ni to'ldiring, qolganini skriptlar qiladi:

```bash
npm run db:create && npm run db:bootstrap && npm run db:migrate && npm run verify
```

Oxirgi qadam **301/301** o'tishi shart. Batafsil: [`backend/README.md`](backend/README.md).

```bash
npm run dev --prefix backend   # :3001
npm run dev --prefix frontend  # :5173
```

## Hujjatlar

[`backend/README.md`](backend/README.md) — arxitektura qarorlari va **ularning
sabablari**: nega RLS, nega bitta sessiya tokeni, nega navbat Postgres'da,
nega playbook versiyalanadi. Har qaror ortida uni keltirib chiqargan muammo
yozilgan.

## Holat

**FAZA 1 (Telegram)** — ishlab chiqilmoqda. Audio/STT FAZA 2 da, telefoniya
FAZA 3 da.
