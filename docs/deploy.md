# Serverga ko'chirish va avtomatik deploy

Maqsad: platforma Contabo VPS'da (Ubuntu, 12 vCPU, 48 GB RAM, 400 GB SSD)
Docker orqali ishlaydi. Har `git push` (main) → GitHub Actions tekshiradi,
obraz yig'adi va serverga o'zi deploy qiladi. Serverga qo'lda kirish faqat
bir marta — boshlang'ich sozlash uchun kerak.

```
 brauzer ──HTTPS──▶ web (Caddy: frontend + reverse proxy)
                      │  /api/*  /mcp  /oauth/*  /.well-known/*
                      ▼
                    backend (Fastify API + AI worker + GigaAM STT, CPU)
                      │
                      ▼
                    db (PostgreSQL 18, faqat ichki tarmoq)
```

Fayllar: `backend/Dockerfile`, `deploy/web.Dockerfile`, `deploy/Caddyfile`,
`deploy/docker-compose.yml`, `deploy/.env.example`, `deploy/backup.sh`,
`.github/workflows/deploy.yml`.

---

## 1. Serverni tayyorlash (bir marta, root sifatida)

```bash
apt update && apt upgrade -y
# Docker (rasmiy skript)
curl -fsSL https://get.docker.com | sh
# Deploy foydalanuvchisi — CI shu nom bilan kiradi
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
mkdir -p /opt/sotuv/backups && chown -R deploy:deploy /opt/sotuv
# Faervol: faqat SSH, HTTP, HTTPS
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw --force enable
```

SSH xavfsizligi: o'z kompyuteringizning ochiq kalitini `/root/.ssh/authorized_keys`
ga qo'shib, keyin `/etc/ssh/sshd_config` da `PasswordAuthentication no` qiling
va `systemctl restart ssh`. (Avval kalit bilan kira olishingizni tekshiring!)

## 2. `.env` ni tayyorlash

```bash
su - deploy
cd /opt/sotuv
# deploy/.env.example mazmunini shu yerga .env qilib yozing
nano .env
chmod 600 .env
```

Qiymatlar:

| Kalit | Qayerdan |
|---|---|
| `POSTGRES_PASSWORD`, `APP_DB_PASSWORD` | `openssl rand -hex 24` (har biri alohida) |
| `COOKIE_SECRET` | `openssl rand -hex 32` |
| `CREDENTIALS_KEY` | **lokal `backend/.env` dagi AYNAN O'SHA qiymat** — aks holda bazadagi shifrlangan GLM va Moi Zvonki kalitlari ochilmaydi |
| `HF_TOKEN` | lokal `backend/.env` dagi qiymat |
| `SITE_ADDRESS`, `WEB_ORIGIN`, `PUBLIC_URL` | domen bo'lsa `sotuv.example.uz` / `https://sotuv.example.uz`; bo'lmasa `:80` / `http://SERVER_IP` |

## 3. CI/CD ni ulash (GitHub, bir marta)

1. Kompyuteringizda deploy uchun alohida kalit: `ssh-keygen -t ed25519 -f sotuv_deploy -N ""`
2. `sotuv_deploy.pub` mazmunini serverda `/home/deploy/.ssh/authorized_keys` ga qo'shing
   (`mkdir -p ~/.ssh && chmod 700 ~/.ssh`, fayl `chmod 600`).
3. GitHub → repo → **Settings → Secrets and variables → Actions**:
   - Secrets: `DEPLOY_HOST` (server IP), `DEPLOY_USER` = `deploy`,
     `DEPLOY_SSH_KEY` (`sotuv_deploy` fayl mazmuni — yopiq kalit).
   - Variables: `DEPLOY_ENABLED` = `true`.
4. Obrazlar (`ghcr.io/itliveacademycompany/sales-copilot-backend` va `-web`)
   ochiq repodan meros olib **public** — server ularni tokensiz tortadi
   (2026-10-20 tekshirilgan). Obrazlarda sir yo'q: kalitlar faqat serverdagi `.env` da.
   Kelajakda private qilinsa — `read:packages` huquqli token yarating va
   `GHCR_READ_TOKEN` secret sifatida qo'shing.

Shundan keyin har `git push origin main`:
`Tekshiruv → Docker obrazlar → zaxira → yangi versiya → /readyz kutish`.
Backend 150 s ichida tayyor bo'lmasa — workflow qizil bo'ladi va loglarni ko'rsatadi.

## 4. Ma'lumotlarni ko'chirish (bir marta)

**Tartib muhim.** Lokal backend va server bir vaqtda ishlasa, ikkalasi ham
Moi Zvonki'dan bir xil qo'ng'iroqlarni olib, GLM tokenini ikki marta sarflaydi.

1. **Lokal backend'ni to'xtating** (yoki lokal `.env` da `WORKER_ENABLED=false`).
2. Lokal bazadan zaxira (PowerShell):
   ```powershell
   & "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" -U postgres -d sotuv -Fc -f sotuv.dump
   scp sotuv.dump deploy@SERVER_IP:/opt/sotuv/backups/
   ```
3. Serverda (`deploy` foydalanuvchisi, `/opt/sotuv`):
   ```bash
   docker compose up -d db
   # ilova rolini yaratish (RLS uchun superuser bo'lmagan rol)
   docker compose run --rm --no-deps --entrypoint node backend dist/db/bootstrap-role.js
   # tiklash
   docker compose exec -T db pg_restore -U postgres -d sotuv --no-owner --no-privileges /backups/sotuv.dump
   # hammasini ishga tushirish (migratsiya o'zi tekshiradi, huquqlar qayta beriladi)
   docker compose up -d
   docker compose logs -f backend
   ```
4. Tekshiruv: saytga kiring, suhbatlar va ballar ko'rinadi, Sozlamalar →
   AI provayderlar → GLM → «Tekshirish» yashil.

## 5. Kundalik ishlar

```bash
docker compose ps                       # holat
docker compose logs -f --tail=100 backend
IMAGE_TAG=<oldingi-commit-sha> docker compose up -d   # orqaga qaytish (rollback)
crontab -e   # zaxira:  15 3 * * * /opt/sotuv/backup.sh >> /opt/sotuv/backups/backup.log 2>&1
```

Zaxira serverning o'zida 14 kun saqlanadi. Disk buzilsa u ham yo'qoladi —
haftada bir marta o'zingizga ko'chiring: `scp deploy@SERVER_IP:/opt/sotuv/backups/*.dump .`

---

## 6. 400 GB qancha vaqtga yetadi

O'lchangan (2026-10-19, lokal baza): 503 ta qo'ng'iroq, ~165 tasi to'liq
tahlil qilingan, baza **17 MB**. Bitta tahlil qilingan qo'ng'iroq (transkript +
ballar + tahlil + vazifa/ogohlantirish, indekslar bilan) ≈ **25–30 KB**.
Oqim: kuniga ~45–70 qo'ng'iroq (bitta biznes). O'rtacha yozuv: 127 s, **400 KB** mp3.

| Ssenariy | Kuniga | Yiliga | 400 GB* |
|---|---|---|---|
| Hozirgi: audio saqlanmaydi, faqat matn (1 biznes) | ~1.5 MB | ~0.6 GB | amalda cheksiz |
| Faqat matn, 20 biznes | ~30 MB | ~11 GB | 30+ yil |
| Audio ham saqlansa (1 biznes) | ~20 MB | ~7.3 GB | ~45 yil |
| Audio ham saqlansa, 20 biznes | ~400 MB | ~146 GB | ~2.4 yil |

\* Foydali joy ~350 GB: OS, Docker obrazlari (backend ~3–4 GB/versiya, eskilari
avtomatik o'chiriladi), modellar (~2 GB), zaxiralar.

**Tavsiya:** matnni (transkript, ballar) o'chirish shart emas — bu mahsulotning
asosiy qiymati va hajmi juda kichik. Haqiqiy disk iste'molchilari — Docker
loglari (compose'da 3 × 20 MB bilan cheklangan) va zaxiralar (14 kun) —
avtomatik nazoratda. Audio saqlanmaydi (pastga qarang).

## 7. Audio platformada saqlanmaydi — bu allaqachon shunday ishlaydi

- Qo'ng'iroq yozuvi Moi Zvonki'dan yuklanadi → vaqtinchalik papkaga yoziladi →
  STT → **papka darhol o'chiriladi** (`calls/pipeline.ts`, `finally { rm(...) }`).
- Bazada faqat yozuvning **havolasi** (`conversation.media_url`) saqlanadi.
  Suhbat sahifasidagi pleyer audioni **har safar Moi Zvonki'dan o'zi tortib oladi**.
- Qayta tahlil audiodan emas, saqlangan transkriptdan qilinadi — audio kerak emas.
- Tekshirildi: eng eski (08.10) va eng yangi yozuv havolasi ishlaydi
  (HTTP 206, `audio/mpeg`, oldinga o'tkazish ishlaydi).

Cheklovlar:
1. Moi Zvonki yozuvlarni qancha saqlashi ularning tarifiga bog'liq — muddati
   o'tsa pleyer ishlamaydi, lekin transkript, ballar va iqtiboslar qoladi.
   Muddatni Moi Zvonki'dan aniqlang.
2. Havola login so'ramaydi — havolani bilgan har kim eshita oladi. Platforma
   uni faqat ruxsati bor foydalanuvchiga ko'rsatadi, lekin havola nusxalanib
   tarqalishi mumkin. Kerak bo'lsa: audioni backend orqali (login tekshiruvi
   bilan) uzatish va havolani brauzerga bermaslik.

## 8. GLM fikrlash darajasi va tezlik (o'lchov, 2026-10-21)

Bitta qo'ng'iroq vaqtining ~90% i GLM tahliliga ketadi (STT ~10%). Z.ai'da
`reasoning_effort` standarti `max`. `glm-5.3-flash` faqat `low`, `high`, `max`
ni qabul qiladi (`medium`/`xhigh` → 400). Bir xil 6 ta real qo'ng'iroqda:

| Daraja | Vaqt | Token / qo'ng'iroq | Iqtibos topildi | `max` dan ball farqi |
|---|---|---|---|---|
| `low` | 46 s | 10.5k | 78% | o'rt. 7.9, maks 15.6 |
| `high` | 99 s | 14.3k | 97% | 1 tasida qo'ng'iroq turi xato (42 ball) |
| `max` | 325 s | 30.7k | 100% | — |

Qaror: hozircha `max` (sifat — mahsulotning asosiy qiymati). Tezlik
`MOIZVONKI_PARALLEL=4` bilan olinadi (tajribada 6 ta parallel so'rov 429'siz
o'tdi). Paket hisobi: 100M / ~31k ≈ 3 200 qo'ng'iroq. `high` ga o'tishdan
oldin kattaroq namunada (30+ qo'ng'iroq) qayta o'lchang. O'zgartirish:
serverdagi `.env` da `LLM_REASONING_EFFORT=high` va `docker compose up -d backend`.
