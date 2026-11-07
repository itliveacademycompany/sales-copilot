import { and, eq, ne } from 'drizzle-orm';
import type { Tx } from '../db/index.js';
import { appUser, businessMember, seat } from '../db/schema/index.js';
import { isUniqueViolation } from '../db/errors.js';
import { AppError } from './errors.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MENEJER HISOBI — rahbar login va parolni o'zi beradi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Aktivatsiya havolasiga (FR-04, `activation.ts`) muqobil yo'l: rahbar
 * «Yangi menejer» / «Menejerni tahrirlash» oynasida parol kiritadi va
 * menejer darhol shu login + parol bilan kira oladi.
 *
 * Kirish `app_user.login` bo'yicha ishlaydi (`routes/auth.ts`), `seat.login`
 * esa faqat ko'rsatish uchun. Shuning uchun bu yerda ikkalasi HAR DOIM
 * bir xil saqlanadi — aks holda kartada bir login, kirishda boshqasi bo'lardi.
 *
 * XAVFSIZLIK — nega «faqat shu o'ringa tegishli hisob»:
 * O'ringa biriktirilgan hisob boshqa joyda ham ishlatilishi mumkin — ega
 * o'zi ham qo'ng'iroq qiladi (rahbar + o'rin) yoki bir odam ikki biznesda
 * ishlaydi (FR-08). Bunday hisobning parolini bu yerdan almashtirishga
 * ruxsat berilsa, bo'lim boshlig'i egani yoki boshqa biznes rahbari o'sha
 * biznes xodimini «egallab» olardi. Shuning uchun parol va login faqat
 * BUTUNLAY shu o'ringa tegishli hisobda o'zgaradi; qolganida hisob egasi
 * parolni o'zi «Profil» bo'limida almashtiradi.
 *
 * Har bir funksiya chaqiruvchining tranzaksiyasida ishlaydi va har so'rov
 * aniq `businessId` / `seatId` bilan toraytirilgan (RLS chetlab o'tilgan
 * ulanishda ham boshqa tenantga tegib bo'lmasin).
 */

const UMUMIY_HISOB =
  "Bu menejerning hisobi boshqa joyda ham ishlatiladi (rahbar yoki boshqa kabinet) — " +
  "parol va loginni hisob egasi o'zi «Profil» bo'limida o'zgartiradi";
const LOGIN_BAND = 'Bu login band — boshqasini tanlang';

/**
 * Hisob faqat shu biznesdagi menejer o'rinlariga tegishlimi?
 *
 * Email bor yoki tizim roli `user` emas — bu odamning shaxsiy hisobi
 * (ega, platforma admini). Rahbarlik a'zoligi yoki boshqa biznesdagi
 * o'rin — hisob umumiy. Uchala holatda ham parolga tegilmaydi.
 */
async function faqatShuBiznesniki(tx: Tx, userId: string, businessId: string): Promise<boolean> {
  const [user] = await tx
    .select({ email: appUser.email, systemRole: appUser.systemRole })
    .from(appUser)
    .where(eq(appUser.id, userId))
    .limit(1);
  if (!user || user.email || user.systemRole !== 'user') return false;

  const [rahbar] = await tx
    .select({ id: businessMember.id })
    .from(businessMember)
    .where(eq(businessMember.userId, userId))
    .limit(1);
  if (rahbar) return false;

  const [begonaOrin] = await tx
    .select({ id: seat.id })
    .from(seat)
    .where(and(eq(seat.userId, userId), ne(seat.businessId, businessId)))
    .limit(1);
  return !begonaOrin;
}

/**
 * Login boshqa hisobda bandmi. `app_user_login_uq` indeksi shartsiz
 * (o'chirilgan hisoblarni ham qamraydi), shuning uchun tekshiruv ham
 * `deletedAt` ga qaramaydi — aks holda INSERT baribir yiqilardi.
 */
async function loginBand(tx: Tx, login: string, ozimiz: string | null): Promise<boolean> {
  const [band] = await tx
    .select({ id: appUser.id })
    .from(appUser)
    .where(ozimiz ? and(eq(appUser.login, login), ne(appUser.id, ozimiz)) : eq(appUser.login, login))
    .limit(1);
  return !!band;
}

/** Poyga: tekshiruvdan keyin boshqa so'rov loginni egallagan bo'lsa ham 409 qaytsin. */
async function loginBilanYoz<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isUniqueViolation(err, 'app_user_login_uq')) throw AppError.conflict(LOGIN_BAND);
    throw err;
  }
}

/**
 * O'ringa login + parol beradi.
 *
 * - O'rinda hisob yo'q → yangi hisob yaratiladi va biriktiriladi.
 * - Hisob bor (faqat shu o'rinniki) → parol va login yangilanadi.
 *
 * Ikkala holatda o'rin «aktivatsiya qilingan» bo'ladi va eski aktivatsiya
 * havolasi bekor qilinadi — rahbar parolni bergach, havola ochiq eshik
 * bo'lib qolmasin.
 *
 * @returns biriktirilgan hisob va u avvaldan bor edimi (bor bo'lsa —
 *          chaqiruvchi tranzaksiyadan keyin uning eski sessiyalarini yopadi).
 */
export async function orinGaParolBer(
  tx: Tx,
  p: { businessId: string; seatId: string; login: string; passwordHash: string },
): Promise<{ userId: string; avvaldanBor: boolean }> {
  const [o] = await tx
    .select({ userId: seat.userId, displayName: seat.displayName, isActive: seat.isActive })
    .from(seat)
    .where(and(eq(seat.id, p.seatId), eq(seat.businessId, p.businessId)))
    .limit(1);
  if (!o) throw AppError.notFound();
  if (!o.isActive) throw AppError.badRequest("O'chirilgan o'ringa parol berilmaydi — avval faollashtiring");

  let userId = o.userId;
  const avvaldanBor = !!userId;

  if (userId) {
    if (!(await faqatShuBiznesniki(tx, userId, p.businessId))) throw AppError.conflict(UMUMIY_HISOB);
    if (await loginBand(tx, p.login, userId)) throw AppError.conflict(LOGIN_BAND);
    const id = userId;
    await loginBilanYoz(() =>
      tx
        .update(appUser)
        .set({ login: p.login, passwordHash: p.passwordHash, updatedAt: new Date() })
        .where(eq(appUser.id, id)),
    );
  } else {
    if (await loginBand(tx, p.login, null)) throw AppError.conflict(LOGIN_BAND);
    const [yangi] = await loginBilanYoz(() =>
      tx
        .insert(appUser)
        .values({ login: p.login, displayName: o.displayName, passwordHash: p.passwordHash, systemRole: 'user' })
        .returning({ id: appUser.id }),
    );
    userId = yangi!.id;
  }

  await tx
    .update(seat)
    .set({
      userId,
      login: p.login,
      activation: 'active',
      isOccupied: true,
      activationToken: null,
      activationExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(seat.id, p.seatId), eq(seat.businessId, p.businessId)));

  return { userId, avvaldanBor };
}

/**
 * Parolsiz login o'zgarishi: o'rinda hisob bo'lsa, kirish logini ham
 * birga o'zgaradi. Aks holda kartada yangi login turadi-yu, menejer
 * faqat eskisi bilan kira olardi.
 */
export async function hisobLogininiYangila(
  tx: Tx,
  p: { businessId: string; userId: string; login: string },
): Promise<void> {
  if (!(await faqatShuBiznesniki(tx, p.userId, p.businessId))) throw AppError.conflict(UMUMIY_HISOB);
  if (await loginBand(tx, p.login, p.userId)) throw AppError.conflict(LOGIN_BAND);
  await loginBilanYoz(() =>
    tx.update(appUser).set({ login: p.login, updatedAt: new Date() }).where(eq(appUser.id, p.userId)),
  );
}
