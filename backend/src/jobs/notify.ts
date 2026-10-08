import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { alertPrefsSchema } from '../business/settings.js';
import {
  manzillarniTop,
  telegramTargetsSchema,
  type ChannelMatrix,
} from '../business/channels.js';
import { decryptSecret } from '../crypto/secrets.js';
import { withoutTenantIsolation } from '../db/index.js';
import { alert, business, integration, seat } from '../db/schema/index.js';
import { sendTelegramMessage } from '../telegram/send.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OGOHLANTIRISH DISPETCHERI — outbox
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ogohlantirish `analyze.ts` da, tahlil TRANZAKSIYASI ichida yaratiladi.
 * Telegram'ga yuborish esa tashqi HTTP chaqiruvi — uni o'sha tranzaksiya
 * ichida qilish ikki xavf tug'diradi:
 *
 *   1. Telegram sekin javob bersa, tranzaksiya ochiq qoladi va bazadagi
 *      qulflar butun tahlil quvurini sekinlashtiradi.
 *   2. Tranzaksiya keyin bekor qilinsa, xabar allaqachon yuborilgan
 *      bo'ladi — orqaga qaytarib bo'lmaydi.
 *
 * Shuning uchun klassik outbox: yozuv avval bazaga tushadi
 * (`notified_at is null`), dispetcher esa uni alohida oladi va yuboradi.
 * Server o'rtada yiqilsa xabar yo'qolmaydi — keyingi tikda qayta olinadi.
 *
 * Dispetcher ATAYLAB otilmaydi: bitta biznesning noto'g'ri chat id si
 * qolgan bizneslarning xabarini to'xtatmasligi kerak.
 */

/** Bir tikda ko'pi bilan shuncha ogohlantirish yuboriladi. */
const TIK_LIMITI = 20;

/**
 * Muvaffaqiyatsiz yuborishni qayta urinmaymiz.
 *
 * Sabab: eng ko'p uchraydigan xato — chat id noto'g'ri yoki bot guruhdan
 * chiqarilgan. Bular o'z-o'zidan tuzalmaydi, qayta urinish esa har tikda
 * bir xil xatoni takrorlab, jurnalni to'ldirardi. Yozuv baribir
 * `notified_at` bilan belgilanadi va ilovadagi ro'yxatda ko'rinadi —
 * ya'ni ogohlantirish yo'qolmaydi, faqat Telegram'ga bormaydi.
 */
export interface NotifyResult {
  sent: number;
  failed: number;
  skipped: number;
}

const TUR_NOM: Record<string, string> = {
  red_flag: 'Qizil bayroq',
  missed_lead: 'Javobsiz mijoz',
  broken_commitment: 'Buzilgan va\'da',
  low_confidence: 'Inson ko\'rigi kerak',
  quality_drop: 'Sifat pasayishi',
};

/** Telegram uchun oddiy matn — `parse_mode` yo'q, `send.ts` dagi sababga qarang. */
function xabarMatni(a: {
  kind: string;
  title: string;
  seatName: string | null;
  createdAt: Date;
  businessName: string;
}): string {
  const qatorlar = [
    `${TUR_NOM[a.kind] ?? a.kind} — ${a.businessName}`,
    '',
    a.title,
  ];
  if (a.seatName) qatorlar.push(`Menejer: ${a.seatName}`);
  qatorlar.push(`Vaqt: ${a.createdAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`);
  return qatorlar.join('\n');
}

/**
 * Yuborilmagan ogohlantirishlarni tarqatadi.
 *
 * `withoutTenantIsolation` — dispetcher barcha bizneslarni bir tikda
 * ko'radi va uning konteksti bitta ijarachiga bog'lanmagan. Bu holat
 * `reports/daily.ts` dagi kunlik hisobot bilan bir xil.
 */
export async function dispatchAlertNotifications(): Promise<NotifyResult> {
  const natija: NotifyResult = { sent: 0, failed: 0, skipped: 0 };

  const kutayotganlar = await withoutTenantIsolation(
    'ogohlantirish dispetcheri: barcha bizneslar bo\'ylab yuborilmaganlarni olish',
    (tx) =>
      tx
        .select({
          id: alert.id,
          businessId: alert.businessId,
          kind: alert.kind,
          title: alert.title,
          createdAt: alert.createdAt,
          seatName: seat.displayName,
          businessName: business.name,
          alertPrefs: business.alertPrefs,
        })
        .from(alert)
        .innerJoin(business, eq(business.id, alert.businessId))
        .leftJoin(seat, eq(seat.id, alert.seatId))
        .where(and(isNull(alert.notifiedAt), isNull(business.deletedAt)))
        .orderBy(asc(alert.createdAt))
        .limit(TIK_LIMITI),
  );

  if (kutayotganlar.length === 0) return natija;

  /**
   * Integratsiyalarni BITTA so'rovda olamiz.
   *
   * Ilgari bu yerda sikl ichida biznes boshiga bitta so'rov bor edi
   * (N+1). Bitta tikda 20 ta ogohlantirish 20 xil biznesdan kelsa —
   * 20 ta alohida tranzaksiya. `inArray` bilan bu bitta so'rovga
   * aylanadi va biznes soni ortganda ham o'zgarmaydi.
   */
  const biznesIdlar = [...new Set(kutayotganlar.map((a) => a.businessId))];
  const botlar = new Map<string, { token: string; targets: unknown }>();

  const integratsiyalar = await withoutTenantIsolation(
    'ogohlantirish dispetcheri: bizneslarning telegram integratsiyalari',
    (tx) =>
      tx
        .select({
          businessId: integration.businessId,
          config: integration.config,
          credentials: integration.credentialsEncrypted,
          status: integration.status,
        })
        .from(integration)
        .where(
          and(
            inArray(integration.businessId, biznesIdlar),
            eq(integration.kind, 'telegram_bot'),
          ),
        ),
  );

  for (const row of integratsiyalar) {
    if (row.status !== 'connected' || !row.credentials) continue;
    try {
      const token = decryptSecret(row.credentials);
      if (!token) continue;
      botlar.set(row.businessId, {
        token,
        targets: (row.config as Record<string, unknown>)?.telegramTargets,
      });
    } catch {
      // Kalit almashgan yoki yozuv buzilgan — bu biznes uchun Telegram
      // yo'q, lekin qolganlari ishlashda davom etadi.
      continue;
    }
  }
  for (const a of kutayotganlar) {
    const prefs = alertPrefsSchema.parse(a.alertPrefs ?? {});
    const bot = botlar.get(a.businessId);

    const chatIdlar = bot
      ? manzillarniTop(
          prefs.channels as ChannelMatrix,
          telegramTargetsSchema.parse(bot.targets ?? {}),
          a.kind as keyof ChannelMatrix,
        )
      : [];

    if (chatIdlar.length === 0) {
      // Telegram tanlanmagan — bu XATO EMAS. Ogohlantirish ilovada bor,
      // shunchaki tashqariga yuborilmaydi. Belgilab qo'yamiz, aks holda
      // har tikda qayta ko'rib chiqilardi.
      natija.skipped++;
    } else {
      const matn = xabarMatni({
        kind: a.kind,
        title: a.title,
        seatName: a.seatName,
        createdAt: a.createdAt,
        businessName: a.businessName,
      });
      let bittasiKetdi = false;
      for (const chatId of chatIdlar) {
        const r = await sendTelegramMessage(bot!.token, chatId, matn);
        if (r.ok) bittasiKetdi = true;
      }
      if (bittasiKetdi) natija.sent++;
      else natija.failed++;
    }

    await withoutTenantIsolation(
      'ogohlantirish dispetcheri: yuborilgan deb belgilash',
      (tx) =>
        tx
          .update(alert)
          .set({ notifiedAt: sql`now()` })
          .where(eq(alert.id, a.id)),
    );
  }

  return natija;
}
