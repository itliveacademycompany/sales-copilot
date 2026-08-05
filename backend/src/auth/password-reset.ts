import { and, eq, isNull, sql } from 'drizzle-orm';
import { decryptSecret } from '../crypto/secrets.js';
import { withoutTenantIsolation } from '../db/index.js';
import { appUser, passwordReset } from '../db/schema/index.js';
import { sendTelegramMessage } from '../telegram/send.js';
import { generateToken, hashToken } from './tokens.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PAROLNI TIKLASH — FR-06
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── Nega email yo'q ──
 * Loyihada SMTP infratuzilmasi yo'q va uni qo'shish domen, SPF/DKIM va
 * yetkazib berish muammolarini olib keladi. Shu bilan birga maqsadli
 * foydalanuvchi — Telegram'da ishlaydigan sotuvchi, va uning akkaunti
 * allaqachon botga bog'langan. Ya'ni **yetkazish kanali allaqachon bor**.
 *
 * Ikkita yo'l:
 *
 *   1. `requestReset` — foydalanuvchi o'zi so'raydi. Havola uning
 *      Telegram'iga yuboriladi. Telegram bog'lanmagan bo'lsa — hech narsa
 *      yuborilmaydi, lekin javob BIR XIL bo'ladi (pastga qarang).
 *
 *   2. `createResetForUser` — rahbar yaratadi va havolani o'zi yetkazadi.
 *      Bu yo'l har doim ishlaydi va sinov davrida asosiy yo'l bo'ladi.
 *
 * ── Nega javob har doim bir xil ──
 * "Bunday email topilmadi" javobi ro'yxatdan o'tgan manzillarni tekshirish
 * imkonini beradi (user enumeration). Shuning uchun `requestReset` hech
 * qachon natijani oshkor qilmaydi — topilsa ham, topilmasa ham bir xil
 * javob qaytadi.
 */

/** Havola muddati. Qisqa — parol tiklash zudlik bilan bajariladigan amal. */
const TTL_MINUTES = 30;

export interface ResetIssue {
  token: string;
  expiresAt: Date;
}

/**
 * Token yaratadi va bazaga xeshini yozadi.
 *
 * Foydalanuvchining oldingi ishlatilmagan tokenlari bekor qilinadi:
 * aks holda eski havola ham ishlayverardi va "havolani boshqa odam
 * ko'rgan" holatida uni bekor qilishning imkoni bo'lmasdi.
 */
export async function createResetForUser(
  userId: string,
  requestedVia: 'self' | 'admin',
): Promise<ResetIssue> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60_000);

  await withoutTenantIsolation('parol tiklash: token yaratish', async (tx) => {
    await tx
      .update(passwordReset)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordReset.userId, userId), isNull(passwordReset.usedAt)));

    await tx.insert(passwordReset).values({
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      requestedVia,
    });
  });

  return { token, expiresAt };
}

/**
 * Foydalanuvchining Telegram chat id si va u tegishli biznesning bot
 * tokeni. Ikkalasi ham bo'lsagina havola yuborish mumkin.
 */
async function telegramKanali(
  userId: string,
): Promise<{ chatId: string; botToken: string } | null> {
  const rows = await withoutTenantIsolation('parol tiklash: telegram kanalini topish', (tx) =>
    tx.execute(sql`
      select s.telegram_id, i.credentials_encrypted
      from seat s
      join integration i
        on i.business_id = s.business_id
       and i.kind = 'telegram_bot'
       and i.status = 'connected'
      where s.user_id = ${userId}
        and s.telegram_id is not null
        and s.is_active = true
      limit 1
    `),
  );
  const r = (rows as Record<string, unknown>[])[0];
  if (!r?.telegram_id || !r.credentials_encrypted) return null;
  return {
    chatId: String(r.telegram_id),
    botToken: decryptSecret(r.credentials_encrypted as Buffer),
  };
}

export interface RequestOutcome {
  /** Ichki kuzatuv uchun. Javobda HECH QACHON qaytarilmaydi. */
  delivered: boolean;
  reason?: string;
}

/**
 * Foydalanuvchi parolni tiklashni so'radi.
 *
 * Chaqiruvchi natijani foydalanuvchiga ko'rsatmasligi kerak — u faqat
 * jurnalga yozish uchun.
 */
export async function requestReset(
  emailOrLogin: string,
  baseUrl: string,
): Promise<RequestOutcome> {
  const kalit = emailOrLogin.trim().toLowerCase();

  const [user] = await withoutTenantIsolation('parol tiklash: foydalanuvchini topish', (tx) =>
    tx
      .select({ id: appUser.id, displayName: appUser.displayName })
      .from(appUser)
      .where(
        and(
          sql`(lower(${appUser.email}) = ${kalit} or lower(${appUser.login}) = ${kalit})`,
          isNull(appUser.deletedAt),
        ),
      )
      .limit(1),
  );
  if (!user) return { delivered: false, reason: 'foydalanuvchi topilmadi' };

  const kanal = await telegramKanali(user.id);
  if (!kanal) return { delivered: false, reason: 'telegram bog\'lanmagan' };

  const { token } = await createResetForUser(user.id, 'self');
  const havola = `${baseUrl}/parol-tiklash/${token}`;

  const res = await sendTelegramMessage(
    kanal.botToken,
    kanal.chatId,
    [
      `${user.displayName}, parolni tiklash so'rovi keldi.`,
      '',
      'Yangi parol o\'rnatish uchun havola:',
      havola,
      '',
      `Havola ${TTL_MINUTES} daqiqa amal qiladi va bir marta ishlaydi.`,
      'Agar bu siz bo\'lmasangiz — bu xabarni e\'tiborsiz qoldiring.',
    ].join('\n'),
  );

  return res.ok
    ? { delivered: true }
    : { delivered: false, reason: `telegram: ${res.error}` };
}

export type ConfirmResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'used' };

/**
 * Tokenni tekshiradi va "ishlatilgan" deb belgilaydi.
 *
 * Parolni yozish chaqiruvchi tomonda bajariladi — bu modul parol
 * siyosatini bilmaydi va sessiyalarni ham bekor qilmaydi. Shu ajratish
 * tufayli tokenni boshqa maqsadda (masalan birinchi parol o'rnatish)
 * ham ishlatish mumkin.
 */
export async function consumeResetToken(token: string): Promise<ConfirmResult> {
  const hash = hashToken(token);

  return withoutTenantIsolation('parol tiklash: tokenni ishlatish', async (tx) => {
    const [row] = await tx
      .select({
        id: passwordReset.id,
        userId: passwordReset.userId,
        usedAt: passwordReset.usedAt,
        expiresAt: passwordReset.expiresAt,
      })
      .from(passwordReset)
      .where(eq(passwordReset.tokenHash, hash))
      .limit(1);

    if (!row) return { ok: false, reason: 'invalid' } as const;
    if (row.usedAt !== null) return { ok: false, reason: 'used' } as const;
    if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'expired' } as const;

    // Poyga holatini bartaraf qilish: faqat hali ishlatilmagan bo'lsa
    // belgilaymiz. Ikki bir vaqtdagi so'rovdan faqat bittasi o'tadi.
    const belgilandi = await tx
      .update(passwordReset)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordReset.id, row.id), isNull(passwordReset.usedAt)))
      .returning({ id: passwordReset.id });

    if (belgilandi.length === 0) return { ok: false, reason: 'used' } as const;
    return { ok: true, userId: row.userId } as const;
  });
}

/** Foydalanuvchi shu biznesga tegishlimi — rahbar tiklash havolasi uchun. */
export async function userBelongsToBusiness(
  userId: string,
  businessId: string,
): Promise<boolean> {
  const rows = await withoutTenantIsolation('parol tiklash: a\'zolikni tekshirish', (tx) =>
    tx.execute(sql`
      select 1 from business_member where user_id = ${userId} and business_id = ${businessId}
      union all
      select 1 from seat where user_id = ${userId} and business_id = ${businessId}
      limit 1
    `),
  );
  return (rows as unknown[]).length > 0;
}

/** Muddati o'tgan tokenlarni tozalash — worker chaqiradi. */
export async function purgeExpiredResets(): Promise<number> {
  const rows = await withoutTenantIsolation('parol tiklash: eskirganlarni tozalash', (tx) =>
    tx
      .delete(passwordReset)
      .where(sql`${passwordReset.expiresAt} < now() - interval '7 days'`)
      .returning({ id: passwordReset.id }),
  );
  return rows.length;
}
