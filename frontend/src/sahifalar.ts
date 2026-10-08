import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SAHIFA BO'LAKLARI — talab bo'yicha yuklanadi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * NEGA ALOHIDA MODUL
 * ──────────────────
 * Bu ro'yxat ikki joyda kerak: `App.tsx` (marshrutlar) va `Layout.tsx`
 * (sichqoncha tekkanda oldindan yuklash). Agar u `App.tsx` da tursa,
 * `Layout` uni import qilib, `App` esa `Layout` ni import qilib —
 * AYLANMA bog'liqlik hosil bo'lardi. Bundler uni hal qiladi, lekin
 * modullarning baholanish tartibiga bog'liq nozik xatolar (`undefined`
 * import) shu yerdan chiqadi. Uchinchi modul bu tugunni butunlay yechadi.
 *
 * NEGA UMUMAN BO'LINGAN
 * ─────────────────────
 * Ilgari hamma sahifa statik import qilinardi va natijada bitta 516 KB
 * lik fayl chiqardi — kirish ekranini ochgan odam ham Analitika (2400
 * qator) va Sozlamalarni (3000 qator) yuklab olardi.
 */

/** Kechiktirilgan komponent + uni OLDINDAN yuklash imkoni. */
export type Kechiktirilgan<T extends ComponentType<Record<string, never>>> =
  LazyExoticComponent<T> & { oldindanYukla: () => void };

/**
 * `React.lazy` ning o'zi oldindan yuklashni bermaydi — modulni faqat
 * render paytida so'raydi. Shuning uchun import funksiyasini saqlab
 * qo'yamiz va uni yon panel sichqoncha tekkanda chaqiradi.
 *
 * Takroriy chaqiruv xavfsiz: dinamik import moduli keshlanadi, ikkinchi
 * marta tarmoqqa chiqilmaydi.
 */
function sahifa<T extends ComponentType<Record<string, never>>>(
  yukla: () => Promise<{ default: T }>,
): Kechiktirilgan<T> {
  const C = lazy(yukla) as Kechiktirilgan<T>;
  C.oldindanYukla = () => {
    void yukla();
  };
  return C;
}

/**
 * Har bir sahifa ANIQ yozilgan, umumiy yordamchi bilan emas.
 *
 * Umumiy `n('Leads')` shaklidagi yordamchi yozib ko'rildi, lekin ba'zi
 * modullar komponentdan tashqari yordamchi qiymatlarni ham eksport
 * qiladi va generik tip ularni ham qamrab olib xato berardi. Aniq
 * yozilgani uzunroq, lekin tip xavfsiz.
 */
export const SAHIFA = {
  dashboard: sahifa(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard }))),
  seatCabinet: sahifa(() => import('./pages/SeatCabinet').then((m) => ({ default: m.SeatCabinet }))),
  analitika: sahifa(() => import('./pages/Analitika').then((m) => ({ default: m.Analitika }))),
  kunlikHisobot: sahifa(() => import('./pages/KunlikHisobotSahifa').then((m) => ({ default: m.KunlikHisobotSahifa }))),
  lidlar: sahifa(() => import('./pages/LidXulosalari').then((m) => ({ default: m.LidXulosalari }))),
  lidTafsilot: sahifa(() => import('./pages/LidTafsilot').then((m) => ({ default: m.LidTafsilot }))),
  conversations: sahifa(() => import('./pages/Conversations').then((m) => ({ default: m.Conversations }))),
  conversationDetail: sahifa(() => import('./pages/ConversationDetail').then((m) => ({ default: m.ConversationDetail }))),
  qongiroqlar: sahifa(() => import('./pages/Qongiroqlar').then((m) => ({ default: m.Qongiroqlar }))),
  aiChat: sahifa(() => import('./pages/AiChat').then((m) => ({ default: m.AiChat }))),
  tasks: sahifa(() => import('./pages/Tasks').then((m) => ({ default: m.Tasks }))),
  alerts: sahifa(() => import('./pages/Alerts').then((m) => ({ default: m.Alerts }))),
  playbook: sahifa(() => import('./pages/PlaybookEditor').then((m) => ({ default: m.PlaybookEditor }))),
  billing: sahifa(() => import('./pages/Billing').then((m) => ({ default: m.Billing }))),
  settings: sahifa(() => import('./pages/Settings').then((m) => ({ default: m.Settings }))),
  onboarding: sahifa(() => import('./pages/Onboarding').then((m) => ({ default: m.Onboarding }))),
  passwordReset: sahifa(() => import('./pages/PasswordReset').then((m) => ({ default: m.PasswordReset }))),
};

/**
 * Yon menyu manzili → sahifa. Layout sichqoncha tekkanda shu ro'yxatdan
 * qidiradi; ro'yxatda yo'q manzil (masalan tashqi havola) jimgina o'tkaziladi.
 */
export const MANZIL_SAHIFA: Record<string, { oldindanYukla: () => void }> = {
  '/': SAHIFA.dashboard,
  '/suhbatlar': SAHIFA.conversations,
  '/qongiroqlar': SAHIFA.qongiroqlar,
  '/vazifalar': SAHIFA.tasks,
  '/ogohlantirishlar': SAHIFA.alerts,
  '/ai-chat': SAHIFA.aiChat,
  '/lidlar': SAHIFA.lidlar,
  '/analitika': SAHIFA.analitika,
  '/kunlik-hisobot': SAHIFA.kunlikHisobot,
  '/playbook': SAHIFA.playbook,
  '/billing': SAHIFA.billing,
  '/sozlamalar': SAHIFA.settings,
};
