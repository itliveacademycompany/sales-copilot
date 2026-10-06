import type { AuthContext } from './context.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AUTH KONTEKSTI KESHI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * MUAMMO
 * ──────
 * `loadAuthContext` HAR BIR autentifikatsiyalangan so'rovda chaqiriladi va
 * har safar tranzaksiya ochib uchta so'rov yuboradi. O'lchandi: mediana
 * 1.27 ms, p95 1.79 ms. Eng arzon endpoint 3 ms bo'lgani hisobga olinsa,
 * bu har so'rovning polining qariyb yarmi. Analitika sahifasi 8 ta so'rov
 * yuboradi — ya'ni ~10 ms faqat "bu kim?" degan savolga.
 *
 * Ma'lumot esa deyarli o'zgarmaydi: odamning roli va biznes a'zoligi
 * oyiga bir marta o'zgarsa katta gap.
 *
 * YECHIM VA UNING NARXI
 * ─────────────────────
 * Jarayon ichidagi kesh, QISQA muddat bilan. Bu — xavfsizlik savdosi:
 * huquq olib qo'yilsa, u eng ko'pi bilan TTL davomida amal qilib turadi.
 * Shuning uchun ikki qavat:
 *
 *   1. TTL qisqa (30 s) — eng yomon holatning yuqori chegarasi.
 *   2. O'zgartirish joylari keshni ANIQ bekor qiladi — odatda kechikish
 *      umuman bo'lmaydi.
 *
 * Faqat TTL ga tayanish yetarli emas edi: rahbar xodimni o'chirgach,
 * u yana yarim daqiqa ishlab turishi qabul qilib bo'lmas holat.
 * Faqat bekor qilishga tayanish ham yetarli emas: bir joyni unutish oson
 * va u holda huquq CHEKSIZ eskirib qolardi. Ikkalasi birga — birining
 * xatosini ikkinchisi qoplaydi.
 *
 * KO'P INSTANSIYADA
 * ─────────────────
 * Kesh jarayon ichida. Ikki server ishlayotgan bo'lsa, biridagi bekor
 * qilish ikkinchisiga yetib bormaydi va u yerda TTL ishlaydi (30 s).
 * Hozir bitta jarayon (`WORKER_ENABLED` bilan bir xil server), shuning
 * uchun bu yetarli. Gorizontal kengayish paytida bu joy Redis pub/sub
 * ga o'tishi kerak — shu izoh o'sha payt uchun ogohlantirish.
 */

/** Eng yomon holatdagi eskirish chegarasi. */
const TTL_MS = 30_000;

/**
 * Kesh hajmi chegarasi.
 *
 * Har yozuv kichik (bir foydalanuvchi va uning bizneslari), lekin
 * chegarasiz o'sish — sekin sizib chiquvchi xotira. 5000 ta faol
 * foydalanuvchi bir vaqtda bo'lishi realdan ancha yuqori.
 */
const MAX = 5000;

interface Yozuv {
  ctx: AuthContext | null;
  muddat: number;
}

const kesh = new Map<string, Yozuv>();

/** Keshdan o'qiydi. Muddati o'tgan yoki yo'q bo'lsa — `undefined`. */
export function keshdanOl(userId: string): AuthContext | null | undefined {
  const y = kesh.get(userId);
  if (!y) return undefined;
  if (y.muddat <= Date.now()) {
    kesh.delete(userId);
    return undefined;
  }
  return y.ctx;
}

/**
 * Keshga yozadi.
 *
 * `null` ham yoziladi (foydalanuvchi topilmadi): aks holda o'chirilgan
 * hisob bilan kelgan har so'rov bazaga borardi — arzon DoS yo'li.
 */
export function keshgaYoz(userId: string, ctx: AuthContext | null): void {
  // Chegaraga yetganda eng eskisini chiqaramiz. `Map` kiritish tartibini
  // saqlaydi, shuning uchun birinchi kalit — eng eskisi.
  if (kesh.size >= MAX) {
    const eng = kesh.keys().next().value;
    if (eng !== undefined) kesh.delete(eng);
  }
  kesh.set(userId, { ctx, muddat: Date.now() + TTL_MS });
}

/** Bitta foydalanuvchi keshini bekor qiladi (profil, rol, o'rin o'zgardi). */
export function keshniBekorQil(userId: string): void {
  kesh.delete(userId);
}

/**
 * Butun keshni bekor qiladi.
 *
 * Biznes darajasidagi o'zgarish (nom, onboarding qadami) hamma a'zoga
 * tegadi. Kimlar a'zo ekanini aniqlash uchun yana bazaga borish kerak
 * bo'lardi — bu esa tejagan vaqtimizni qaytarib berardi. Keshni butunlay
 * tozalash arzonroq: u 30 soniyada o'zi qayta to'ladi.
 */
export function keshniTozala(): void {
  kesh.clear();
}

/** Kuzatuv uchun — testda va nosozlikni topishda kerak. */
export function keshHolati(): { hajm: number } {
  return { hajm: kesh.size };
}
