import { z } from 'zod';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BILDIRISHNOMA KANALLARI — qaysi hodisa QAYERGA boradi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * To'rtta manzil bor va ular bir-birini almashtirmaydi:
 *
 *   web     — ilova ichidagi «Ogohlantirishlar» sahifasi. HAR DOIM yoqiq
 *             va o'chirib bo'lmaydi: ogohlantirish yaratilgan-u, hech
 *             qayerda ko'rinmasa — u umuman yaratilmagani bilan barobar.
 *             O'chirish kerak bo'lsa, hodisa turining O'ZINI o'chirish
 *             kerak (`alertPrefs.kinds`), kanalni emas.
 *   dm      — botning rahbar bilan shaxsiy yozishmasi.
 *   group   — jamoa guruhi.
 *   channel — Telegram kanali (faqat o'qish uchun e'lon taxtasi).
 *
 * Uch xil Telegram manzili ataylab ajratilgan: shoshilinch qizil bayroq
 * guruhga borishi, kunlik xulosa esa kanalga tushishi mumkin — ularni
 * bitta "Telegram" tugmasiga birlashtirsak, bu tanlov yo'qolardi.
 */

/** Telegram manzil turlari — `web` bu yerda yo'q, u Telegram emas. */
export const TELEGRAM_KANALLAR = ['dm', 'group', 'channel'] as const;
export type TelegramKanal = (typeof TELEGRAM_KANALLAR)[number];

/** Bildirishnoma yuboriladigan hamma kanal. */
export const KANALLAR = ['web', ...TELEGRAM_KANALLAR] as const;
export type Kanal = (typeof KANALLAR)[number];

/**
 * Bitta hodisa turi uchun kanallar.
 *
 * `web` sxemada yo'q — u o'zgarmas. Bo'lsa, kimdir uni `false` qilib
 * qo'yishi va ogohlantirishlar jimgina yo'qolishi mumkin edi.
 */
const kanalTanlov = z
  .object({
    dm: z.boolean().default(false),
    group: z.boolean().default(false),
    channel: z.boolean().default(false),
  })
  .default({});

export type KanalTanlov = z.infer<typeof kanalTanlov>;

/** Matritsa qatorlari — 5 ta ogohlantirish turi + kunlik hisobot. */
export const channelMatrixSchema = z
  .object({
    red_flag: kanalTanlov,
    missed_lead: kanalTanlov,
    broken_commitment: kanalTanlov,
    low_confidence: kanalTanlov,
    quality_drop: kanalTanlov,
    daily_report: kanalTanlov,
  })
  .default({});

export type ChannelMatrix = z.infer<typeof channelMatrixSchema>;

/**
 * Telegram manzil — bitta chat.
 *
 * `title` faqat interfeys uchun: raqamli id (`-1001234567890`) hech
 * kimga hech narsa demaydi, guruh nomi esa darhol tushunarli.
 */
export const telegramManzil = z.object({
  chatId: z.string().trim().min(1).max(64),
  title: z.string().trim().max(200).nullable().default(null),
});

export type TelegramManzil = z.infer<typeof telegramManzil>;

/**
 * Integratsiya konfiguratsiyasidagi manzillar registri.
 *
 * `discovered` — bot ko'rgan guruh va kanallar. Foydalanuvchi raqamli
 * chat id ni qo'lda topishga majbur bo'lmasligi uchun: botni guruhga
 * qo'shib, bitta xabar yozsa, guruh shu ro'yxatda paydo bo'ladi va uni
 * ro'yxatdan tanlash mumkin.
 */
export const telegramTargetsSchema = z
  .object({
    dm: telegramManzil.nullable().default(null),
    group: telegramManzil.nullable().default(null),
    channel: telegramManzil.nullable().default(null),
    discovered: z
      .array(
        z.object({
          chatId: z.string(),
          type: z.enum(['private', 'group', 'supergroup', 'channel']),
          title: z.string().nullable(),
          seenAt: z.string(),
        }),
      )
      .max(50)
      .default([]),
  })
  .default({});

export type TelegramTargets = z.infer<typeof telegramTargetsSchema>;

/** Telegram chat turini bizning kanal turimizga o'giradi. */
export function kanalTuri(chatType: string): TelegramKanal {
  if (chatType === 'private') return 'dm';
  if (chatType === 'channel') return 'channel';
  return 'group';
}

/**
 * Hodisa qaysi chat id larga yuborilishi kerak.
 *
 * Bir chat ikki rolda bo'lishi mumkin (masalan `group` ham, `channel` ham
 * bir xil chat qilib qo'yilgan) — shuning uchun natija takrorlanmaydi.
 * Aks holda bitta guruh ikki xil xabar olardi.
 */
export function manzillarniTop(
  matritsa: ChannelMatrix,
  manzillar: TelegramTargets,
  tur: keyof ChannelMatrix,
): string[] {
  const tanlov = matritsa[tur];
  const natija: string[] = [];
  for (const k of TELEGRAM_KANALLAR) {
    if (!tanlov[k]) continue;
    const m = manzillar[k];
    if (m && !natija.includes(m.chatId)) natija.push(m.chatId);
  }
  return natija;
}
