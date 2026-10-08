import { z } from 'zod';
import { channelMatrixSchema } from './channels.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BIZNES SOZLAMALARI — anketadan TASHQARI qismi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `business/profile.ts` — AI Playbook Builder uchun anketa; u to'liq
 * holda promptlarga uzatiladi. Bu yerdagilar esa TIZIM xatti-harakatini
 * boshqaradi (ogohlantirish yaratiladimi, ish vaqti qaysi) va promptga
 * tushmasligi kerak — u yerda faqat shovqin bo'lardi.
 *
 * Alohida modulda, `http/routes/*` da emas: bu sxemalarni `ai/analyze.ts`
 * ham o'qiydi, va loyiha qoidasiga ko'ra `ai/*` modullari `http/routes/*`
 * ga bog'lanmasligi kerak (`business/profile.ts` dagi izohga qarang).
 */

/**
 * Ish jadvali. `days` — ISO hafta kunlari (1 = dushanba, 7 = yakshanba).
 *
 * Standart 9:00–18:00, dushanba–shanba: O'zbekistondagi o'quv markazlari
 * uchun eng keng tarqalgan jadval, ya'ni sozlamaga tegmagan biznes ham
 * to'g'ri raqam ko'radi.
 */
export const workHoursSchema = z.object({
  startHour: z.number().int().min(0).max(23).default(9),
  endHour: z.number().int().min(1).max(24).default(18),
  days: z.array(z.number().int().min(1).max(7)).max(7).default([1, 2, 3, 4, 5, 6]),

  /**
   * Ish vaqtidan tashqaridagi suhbatlar uchun ogohlantirish yaratilmasin.
   *
   * Yoqilganda `analyze.ts` suhbat BOSHLANGAN vaqtga qaraydi — tahlil
   * qachon ishga tushganiga emas. Sabab: tungi navbatda kelgan yozishma
   * ertalab tahlil qilinsa ham, u ish vaqtidagi suhbat emas; aksincha,
   * kunduzgi suhbat kechqurun tahlil qilinsa ham ish vaqtidagi suhbat
   * bo'lib qoladi. Baholash va hisobot o'zgarmaydi — faqat ogohlantirish.
   */
  alertsOnlyWorkHours: z.boolean().default(false),

  /**
   * Menejerlar uchun alohida jadval yoqilganmi.
   *
   * Bu — BOSH KALIT. O'chirilganda `seat.work_hours` da yozilgan
   * qiymatlar BUTUNLAY e'tiborsiz qoladi (o'chirilmaydi — kalit qayta
   * yoqilsa hammasi joyida turishi kerak). Shu sababli "nega menejer
   * jadvali ishlamayapti" degan savolga javob bitta joyda: kalit.
   */
  perSeatSchedules: z.boolean().default(false),
});

/**
 * O'rin jadvali — `null` bo'lsa biznesnikidan foydalanadi.
 *
 * `alertsOnlyWorkHours` va `perSeatSchedules` bu yerda MA'NOSIZ: ular
 * butun biznes bo'yicha qaror, har o'rin uchun emas. Sxemada qolsa,
 * interfeysda har menejer yonida foydasiz kalit paydo bo'lardi.
 */
export const seatWorkHoursSchema = workHoursSchema
  .omit({ alertsOnlyWorkHours: true, perSeatSchedules: true })
  .nullable();

export type SeatWorkHours = z.infer<typeof seatWorkHoursSchema>;

export type WorkHours = z.infer<typeof workHoursSchema>;

/**
 * O'rin uchun AMALDAGI jadval.
 *
 * Yagona joy: analitika, ogohlantirish darvozasi va interfeys —
 * uchalasi ham shu funksiyaga murojaat qiladi. Mantiq takrorlansa,
 * biri `perSeatSchedules` ni tekshirishni unutishi mumkin edi va
 * raqamlar bir-biriga mos kelmay qolardi.
 */
export function amaldagiJadval(
  biznes: WorkHours,
  orin: SeatWorkHours | undefined,
): WorkHours {
  if (!biznes.perSeatSchedules || !orin) return biznes;
  return { ...biznes, ...orin };
}

/** `Intl` qisqartmasidan ISO hafta kuniga (1 = dushanba, 7 = yakshanba). */
const HAFTA_KUN: Record<string, number> = {
  Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
};

/**
 * Berilgan payt biznesning ish jadvaliga to'g'ri keladimi.
 *
 * Hisob BIZNES vaqt zonasida — serverning zonasida emas. Server UTC da
 * ishlashi mumkin, va o'sha holda Toshkentdagi 09:00 UTC da 04:00 bo'lib,
 * har ertalabki suhbat "ish vaqtidan tashqari" deb hisoblanardi.
 *
 * `hourCycle: 'h23'` majburiy: aks holda yarim tun ba'zi lokallarda "24"
 * bo'lib qaytadi va `>= startHour` solishtiruvi buziladi.
 *
 * SQL tomonda xuddi shu mantiq `analytics.ts` da `ishVaqtida()` orqali
 * bajariladi — u yerda hisob bazada, bu yerda esa ilovada, lekin ikkalasi
 * ham bir xil `workHours` obyektidan oziqlanadi.
 */
export function suhbatIshVaqtidami(vaqt: Date, jadval: WorkHours, zona: string): boolean {
  let qism: Intl.DateTimeFormatPart[];
  try {
    qism = new Intl.DateTimeFormat('en-GB', {
      timeZone: zona,
      hour: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    }).formatToParts(vaqt);
  } catch {
    // `Intl` noto'g'ri zonada QAYTARMAYDI — XATO TASHLAYDI. Ushlamasak,
    // bitta noto'g'ri `business.timezone` butun tahlil quvurini
    // yiqitardi. Bunday holda cheklovni qo'llamaymiz: ogohlantirishni
    // adashib yo'qotgandan ko'ra ortiqcha yuborgan yaxshi.
    return true;
  }

  const soat = Number(qism.find((q) => q.type === 'hour')?.value ?? NaN);
  const kun = HAFTA_KUN[qism.find((q) => q.type === 'weekday')?.value ?? ''];
  if (Number.isNaN(soat) || kun === undefined) return true;

  return soat >= jadval.startHour && soat < jadval.endHour && jadval.days.includes(kun);
}

/**
 * Ogohlantirish sozlamalari.
 *
 * Standart — hammasi YOQILGAN: yangi biznes sozlamaga tegmasa ham
 * muhim hodisalarni ko'rishi kerak. O'chirish — ongli qaror.
 */
export const alertPrefsSchema = z.object({
  kinds: z
    .object({
      red_flag: z.boolean().default(true),
      missed_lead: z.boolean().default(true),
      broken_commitment: z.boolean().default(true),
      low_confidence: z.boolean().default(true),
      quality_drop: z.boolean().default(true),
    })
    .default({}),
  /**
   * ESKIRGAN — `channels` bilan almashtirildi.
   *
   * Saqlanib turibdi, chunki mavjud bizneslarning sozlamasida bu maydon
   * bor va uni o'chirish Zod'da xatoga olib kelmasa-da, ma'lumot
   * yo'qolishini bildirardi. Yangi kod uni O'QIMAYDI.
   */
  telegram: z.boolean().default(false),

  /**
   * Kanallar matritsasi: qaysi hodisa qaysi Telegram manziliga borsin.
   *
   * `web` bu yerda yo'q — ilova ichidagi ro'yxat har doim to'ladi.
   * Batafsil: `business/channels.ts`.
   */
  channels: channelMatrixSchema,
  /**
   * Past ball ogohlantirishi.
   *
   * `minTurns` shovqinni to'sadi: ikki xabarlik yozishma past ball
   * olishi tabiiy va u ogohlantirishga arzimaydi.
   */
  lowScore: z
    .object({
      enabled: z.boolean().default(false),
      threshold: z.number().int().min(0).max(100).default(40),
      minTurns: z.number().int().min(1).max(100).default(6),
    })
    .default({}),
});

export type AlertPrefs = z.infer<typeof alertPrefsSchema>;
