import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './auth';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INTERFEYS TILI (i18n)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Kalit — o'zbekcha matnning o'zi: `t("Bosh sahifa")`. Lug'atda yo'q matn
 * o'zbekcha qoladi — tarjima bosqichma-bosqich qo'shiladi va hech narsa
 * buzilmaydi.
 *
 * Til foydalanuvchi profilida (server, `locale`) saqlanadi; tanlanganda
 * interfeys DARHOL almashadi (server javobini kutmasdan).
 */

export type Til = 'uz' | 'en' | 'ru';

const LUGAT: Record<string, { en: string; ru: string }> = {
  // ─── Yon menyu va umumiy ───
  Menyu: { en: 'Menu', ru: 'Меню' },
  'Bosh sahifa': { en: 'Home', ru: 'Главная' },
  "Qo'ng'iroqlar": { en: 'Calls', ru: 'Звонки' },
  'AI Chat': { en: 'AI Chat', ru: 'AI Чат' },
  Analitika: { en: 'Analytics', ru: 'Аналитика' },
  'Kunlik hisobot': { en: 'Daily report', ru: 'Ежедневный отчёт' },
  'Lid xulosalari': { en: 'Lead summaries', ru: 'Сводки по лидам' },
  Ogohlantirishlar: { en: 'Alerts', ru: 'Уведомления' },
  Sozlamalar: { en: 'Settings', ru: 'Настройки' },
  Chiqish: { en: 'Log out', ru: 'Выйти' },
  'Menyuni ochish': { en: 'Open menu', ru: 'Открыть меню' },
  'Menyuni yopish': { en: 'Close menu', ru: 'Закрыть меню' },
  'Menyuni kengaytirish': { en: 'Expand menu', ru: 'Развернуть меню' },
  'Menyuni toraytirish': { en: 'Collapse menu', ru: 'Свернуть меню' },
  Kengaytirish: { en: 'Expand', ru: 'Развернуть' },
  Toraytirish: { en: 'Collapse', ru: 'Свернуть' },
  'Asosiy menyu': { en: 'Main menu', ru: 'Главное меню' },

  // ─── Tepa panel ───
  'Qidirish...': { en: 'Search...', ru: 'Поиск...' },
  'AI yordamchi': { en: 'AI assistant', ru: 'AI помощник' },
  'Profil va sozlamalar': { en: 'Profile and settings', ru: 'Профиль и настройки' },

  // ─── Sozlamalar ───
  'Profil, biznes, jamoa, tahlil va ulanishlar': {
    en: 'Profile, business, team, analysis and integrations',
    ru: 'Профиль, бизнес, команда, анализ и интеграции',
  },
  Umumiy: { en: 'General', ru: 'Общие' },
  "Qo'ng'iroq tahlili": { en: 'Call analysis', ru: 'Анализ звонков' },
  'Lid va CRM': { en: 'Leads & CRM', ru: 'Лиды и CRM' },
  Hisobotlar: { en: 'Reports', ru: 'Отчёты' },
  Profil: { en: 'Profile', ru: 'Профиль' },
  "Ko'rinish": { en: 'Appearance', ru: 'Внешний вид' },
  Bizneslar: { en: 'Businesses', ru: 'Компании' },
  Bildirishnomalar: { en: 'Notifications', ru: 'Уведомления' },
  Rahbarlar: { en: 'Managers', ru: 'Руководители' },
  Menejerlar: { en: 'Sales reps', ru: 'Менеджеры' },
  'Ish jadvali': { en: 'Work schedule', ru: 'График работы' },
  Obuna: { en: 'Subscription', ru: 'Подписка' },
  'Muammo haqida xabar berish': { en: 'Report a problem', ru: 'Сообщить о проблеме' },
  'Baholash mezonlari': { en: 'Scoring criteria', ru: 'Критерии оценки' },
  'Anketa savollari': { en: 'Questionnaire', ru: 'Вопросы анкеты' },
  "Xizmat yo'nalishlari": { en: 'Service lines', ru: 'Направления услуг' },
  "Qo'ng'iroq oilalari": { en: 'Call families', ru: 'Типы звонков' },
  "AI ko'rsatmalari": { en: 'AI instructions', ru: 'Инструкции для AI' },
  'Lid sifati bosqichlari': { en: 'Lead quality stages', ru: 'Этапы качества лидов' },
  'CRM natija bosqichlari': { en: 'CRM outcome stages', ru: 'Этапы результата CRM' },
  'Faol CRM voronkalari': { en: 'Active CRM pipelines', ru: 'Активные воронки CRM' },
  'Telegram bot': { en: 'Telegram bot', ru: 'Telegram бот' },

  // ─── Ko'rinish bo'limi ───
  "Ilovaning yorug', qorong'i yoki tizim ko'rinishini va til sozlamasini tanlang.": {
    en: 'Choose light, dark or system appearance and the interface language.',
    ru: 'Выберите светлую, тёмную или системную тему и язык интерфейса.',
  },
  Mavzu: { en: 'Theme', ru: 'Тема' },
  "Yorug', Qorong'i yoki Tizim rejimini tanlang. Tizim rejimi qurilma sozlamalariga amal qiladi.": {
    en: 'Choose Light, Dark or System. System follows your device settings.',
    ru: 'Выберите светлую, тёмную или системную тему. Системная следует настройкам устройства.',
  },
  Tizim: { en: 'System', ru: 'Системная' },
  "Yorug'": { en: 'Light', ru: 'Светлая' },
  "Qorong'i": { en: 'Dark', ru: 'Тёмная' },
  Til: { en: 'Language', ru: 'Язык' },
  'Interfeys tilini tanlang. Tarjima bosqichma-bosqich qo\'shilmoqda — tarjima qilinmagan matnlar o\'zbekcha qoladi.': {
    en: 'Choose the interface language. Translation is being added step by step — untranslated text stays in Uzbek.',
    ru: 'Выберите язык интерфейса. Перевод добавляется поэтапно — непереведённый текст остаётся на узбекском.',
  },
  'Yon menyu': { en: 'Sidebar', ru: 'Боковое меню' },
  "Tor — faqat ikonlar va qisqa nom; keng — to'liq nomlar bilan.": {
    en: 'Compact — icons with short labels; wide — full names.',
    ru: 'Узкое — иконки и короткие подписи; широкое — полные названия.',
  },
  Tor: { en: 'Compact', ru: 'Узкое' },
  Keng: { en: 'Wide', ru: 'Широкое' },
  'Saqlanmoqda…': { en: 'Saving…', ru: 'Сохранение…' },
  Saqlandi: { en: 'Saved', ru: 'Сохранено' },
  "Saqlanmadi — qayta urinib ko'ring": { en: 'Not saved — try again', ru: 'Не сохранено — попробуйте снова' },

  // ─── Analitika ───
  "Umumiy ko'rinish": { en: 'Overview', ru: 'Обзор' },
  'Sifat nazorati': { en: 'Quality control', ru: 'Контроль качества' },
  'Jamoa malakasini oshirish': { en: 'Team coaching', ru: 'Развитие команды' },
  'Vazifalar tahlili': { en: 'Task analysis', ru: 'Анализ задач' },
  'Mijoz tahlili': { en: 'Customer analysis', ru: 'Анализ клиентов' },
  'Faoliyat tahlili': { en: 'Activity analysis', ru: 'Анализ активности' },
  'Lid analitikasi': { en: 'Lead analytics', ru: 'Аналитика лидов' },
  Bugun: { en: 'Today', ru: 'Сегодня' },
  '3 kun': { en: '3 days', ru: '3 дня' },
  Hafta: { en: 'Week', ru: 'Неделя' },
  Oy: { en: 'Month', ru: 'Месяц' },
  Boshqa: { en: 'Custom', ru: 'Другой' },
};

const TilCtx = createContext<{ til: Til; setTil: (t: Til) => void; t: (s: string) => string }>({
  til: 'uz',
  setTil: () => undefined,
  t: (s) => s,
});

const normal = (l: string | null | undefined): Til => (l === 'en' ? 'en' : l === 'ru' ? 'ru' : 'uz');

export function TilProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [til, setTil] = useState<Til>(() => normal(user?.locale));
  // Server qiymati kelganda (kirish, profil yangilanishi) — sinxronlash
  useEffect(() => setTil(normal(user?.locale)), [user?.locale]);
  useEffect(() => {
    document.documentElement.lang = til;
  }, [til]);
  const t = useCallback((s: string) => (til === 'uz' ? s : LUGAT[s]?.[til] ?? s), [til]);
  const v = useMemo(() => ({ til, setTil, t }), [til, t]);
  return <TilCtx.Provider value={v}>{children}</TilCtx.Provider>;
}

export const useTil = () => useContext(TilCtx);
export const useT = () => useContext(TilCtx).t;
