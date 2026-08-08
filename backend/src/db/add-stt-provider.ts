import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { and, eq } from 'drizzle-orm';
import { encryptSecret, maskSecret } from '../crypto/secrets.js';
import { GoogleStt } from '../ai/stt.js';
import { withoutTenantIsolation } from './index.js';
import { aiProvider } from './schema/index.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GOOGLE STT PROVAYDERINI QO'SHISH — FAZA 2
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Google Speech-to-Text ikki xil kredensial bilan ishlaydi va skript
 * ikkalasini ham qabul qiladi:
 *
 *   1. Service account JSON (ishonchli yo'l — tavsiya etiladi)
 *        STT_KEY_FILE=C:\yol\service-account.json npm run provider:stt
 *
 *   2. API kaliti (loyihada Speech-to-Text API yoqilgan bo'lsa)
 *        STT_API_KEY=AIza... npm run provider:stt
 *
 * Kalit ATAYLAB muhit o'zgaruvchisida — buyruq argumentida bo'lsa,
 * u shell tarixida qolib ketardi.
 *
 * Skript kalitni bazaga yozishdan OLDIN tekshiradi: noto'g'ri kalitni
 * saqlab qo'yish eng chalkash nosozlik — tahlil ishlamaydi, lekin
 * qayerda xato ekani bilinmaydi.
 */

const KEY_FILE = process.env.STT_KEY_FILE;
const API_KEY = process.env.STT_API_KEY;
const MODEL = process.env.STT_MODEL ?? 'default';
const TIL = process.env.STT_LANGUAGE ?? 'uz-UZ';
const NARX = Number(process.env.STT_COST_MIN ?? '0.024');

function yordam(): never {
  console.error(
    'Kredensial berilmadi.\n\n' +
      'Foydalanish (bittasini tanlang):\n' +
      '  $env:STT_KEY_FILE="C:\\yol\\service-account.json"; npm run provider:stt\n' +
      '  $env:STT_API_KEY="AIza..."; npm run provider:stt\n\n' +
      'Qo\'shimcha:\n' +
      '  STT_MODEL     — standart: default (aniqroq: latest_long, lekin hamma tilda yo\'q)\n' +
      '  STT_LANGUAGE  — standart: uz-UZ\n' +
      '  STT_COST_MIN  — daqiqa narxi USD, standart: 0.024\n',
  );
  process.exit(1);
}

async function main(): Promise<void> {
  let credential: string;
  let tur: string;

  if (KEY_FILE) {
    try {
      credential = readFileSync(KEY_FILE, 'utf8');
    } catch (err) {
      console.error(`Faylni o'qib bo'lmadi: ${KEY_FILE}\n${String(err)}`);
      process.exit(1);
    }
    try {
      const sa = JSON.parse(credential) as { client_email?: string; private_key?: string };
      if (!sa.client_email || !sa.private_key) {
        console.error('Bu service account JSON emas — client_email yoki private_key yo\'q.');
        process.exit(1);
      }
      tur = `service account (${sa.client_email})`;
    } catch {
      console.error('JSON o\'qib bo\'lmadi. Google Console dan yuklab olingan faylni ko\'rsating.');
      process.exit(1);
    }
  } else if (API_KEY) {
    credential = API_KEY;
    tur = `API kaliti (${maskSecret(API_KEY)})`;
  } else {
    yordam();
  }

  console.log(`\nKredensial: ${tur}`);
  console.log(`Model: ${MODEL}, til: ${TIL}, narx: $${NARX}/daqiqa`);

  /**
   * Tekshiruv: 1 soniyalik jim WAV yuboriladi. Nutq topilmasligi
   * KUTILGAN natija — bizni qiziqtirgani autentifikatsiya o'tdimi.
   * Shuning uchun "nutq aniqlanmadi" xatosi muvaffaqiyat deb olinadi.
   */
  console.log('\nKalit tekshirilmoqda…');
  const klient = new GoogleStt(credential, MODEL);
  try {
    await klient.transcribe({ audio: jimWav(), mimeType: 'audio/wav', languageCode: TIL });
    console.log('  Kalit ishlaydi.');
  } catch (err) {
    const xabar = err instanceof Error ? err.message : String(err);
    if (xabar.includes('nutq aniqlanmadi')) {
      console.log('  Kalit ishlaydi (jim audiodan nutq topilmadi — bu kutilgan).');
    } else {
      console.error(`\n  Kalit ISHLAMADI:\n  ${xabar}\n`);
      console.error(
        '  Tez-tez uchraydigan sabablar:\n' +
          '   • Google Cloud loyihasida Speech-to-Text API yoqilmagan\n' +
          '   • Service account da "Cloud Speech Client" roli yo\'q\n' +
          '   • Billing yoqilmagan (bepul tarif uchun ham kerak)\n',
      );
      process.exit(1);
    }
  }

  await withoutTenantIsolation('STT provayderini qo\'shish (platforma darajasi)', async (tx) => {
    // Bitta maqsadga bitta faol provayder.
    await tx
      .update(aiProvider)
      .set({ isActive: false })
      .where(and(eq(aiProvider.purpose, 'stt'), eq(aiProvider.isActive, true)));

    await tx.insert(aiProvider).values({
      purpose: 'stt',
      kind: 'google',
      label: 'google-stt',
      apiKeyEncrypted: encryptSecret(credential),
      models: { stt: MODEL, language: TIL, costPerMinuteUsd: NARX },
      isActive: true,
    });
  });

  console.log('\nSaqlandi va faollashtirildi. Endi audio yuklash ishlaydi.\n');
}

/**
 * 1 soniyalik jim 16 kHz mono WAV — kalitni tekshirish uchun.
 * Haqiqiy fayl kerak emas: maqsad autentifikatsiyani sinash.
 */
function jimWav(): Buffer {
  const sampleRate = 16000;
  const samples = sampleRate; // 1 soniya
  const dataSize = samples * 2;
  const buf = Buffer.alloc(44 + dataSize);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); // PCM blok uzunligi
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // bayt/soniya
  buf.writeUInt16LE(2, 32); // blok align
  buf.writeUInt16LE(16, 34); // bit
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  // Qolgani nol — jimlik.
  return buf;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
