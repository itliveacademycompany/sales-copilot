import { z } from 'zod';

/**
 * Telegram Bot API `Update` obyektining bizga kerakli qismi.
 *
 * Ataylab minimal: Telegram yuzlab maydon yuboradi, bizga ulardan
 * o'ntachasi kerak. `passthrough()` qolganini yo'qotmaydi, lekin
 * biz ularga tayanmaymiz.
 *
 * Hujjat: https://core.telegram.org/bots/api#update
 */

export const telegramUser = z
  .object({
    id: z.number().int(),
    is_bot: z.boolean().default(false),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    username: z.string().optional(),
  })
  .passthrough();

export const telegramChat = z
  .object({
    id: z.number().int(),
    /** private = shaxsiy yozishma, group/supergroup = guruh, channel = kanal */
    type: z.enum(['private', 'group', 'supergroup', 'channel']),
    title: z.string().optional(),
    username: z.string().optional(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
  })
  .passthrough();

export const telegramMessage = z
  .object({
    message_id: z.number().int(),
    from: telegramUser.optional(),
    chat: telegramChat,
    /** Unix vaqt, soniyalarda. */
    date: z.number().int(),
    text: z.string().optional(),
    caption: z.string().optional(),
    /** Ovozli xabar — FAZA 1 da matn sifatida emas, belgi sifatida qayd etiladi. */
    voice: z.object({ duration: z.number().int() }).passthrough().optional(),
    photo: z.array(z.unknown()).optional(),
    document: z.object({ file_name: z.string().optional() }).passthrough().optional(),
  })
  .passthrough();

export const telegramUpdate = z
  .object({
    update_id: z.number().int(),
    message: telegramMessage.optional(),
    edited_message: telegramMessage.optional(),
    channel_post: telegramMessage.optional(),
  })
  .passthrough();

export type TelegramUpdate = z.infer<typeof telegramUpdate>;
export type TelegramMessage = z.infer<typeof telegramMessage>;

/**
 * Xabardan matn ajratib olish.
 *
 * Rasm/fayl uchun matn o'rniga belgi qo'yamiz — bu kontekst sifatida
 * muhim (FR-44): "narx ro'yxati yuborildi" degan fakt suhbat tahlilida
 * hisobga olinishi kerak, garchi rasmning o'zini o'qimasak ham.
 */
export function extractText(msg: TelegramMessage): string | null {
  if (msg.text) return msg.text;
  if (msg.caption) return msg.caption;
  if (msg.voice) return `[ovozli xabar, ${msg.voice.duration} soniya]`;
  if (msg.photo) return '[rasm]';
  if (msg.document) return `[fayl: ${msg.document.file_name ?? 'nomsiz'}]`;
  return null;
}

/** Update ichidan asosiy xabarni topish. Tahrirlangan xabarlar e'tiborsiz qoldiriladi. */
export function primaryMessage(update: TelegramUpdate): TelegramMessage | null {
  return update.message ?? update.channel_post ?? null;
}
