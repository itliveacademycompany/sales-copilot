import type { Lugat } from './index';

/**
 * Ichki CRM — amoCRM (tashqi CRM) dan bir tomonlama sinxron: sozlama,
 * bitim kartochkasi, Kanban, CRM sozlamalari va server xabarlari.
 */
const CRM_SINX: Lugat = {
  // ─── Integratsiya sahifasi ───
  "Sdelkalarni SotuvAI CRM ga ko'chirish": { en: 'Copy deals into SotuvAI CRM', ru: 'Переносить сделки в CRM SotuvAI' },
  "Har bir sdelka SotuvAI CRM da bitim bo'ladi — o'sha voronka, bosqich, mas'ul, kontakt va qo'shimcha maydonlar bilan. Asosiy manba {crm}: nom, summa, bosqich va mas'ul u yerda o'zgartiriladi, bu yerga har daqiqada keladi.":
    {
      en: 'Every deal becomes a deal in SotuvAI CRM — with the same pipeline, stage, responsible user, contact and custom fields. {crm} stays the source of truth: name, amount, stage and responsible user are changed there and arrive here every minute.',
      ru: 'Каждая сделка станет сделкой в CRM SotuvAI — с той же воронкой, этапом, ответственным, контактом и дополнительными полями. Главный источник — {crm}: название, сумма, этап и ответственный меняются там и приходят сюда каждую минуту.',
    },
  "Yoqildi — barcha sdelkalar SotuvAI CRM ga ko'chirilmoqda, bir necha daqiqa ketadi.": {
    en: 'Enabled — all deals are being copied into SotuvAI CRM; this takes a few minutes.',
    ru: 'Включено — все сделки переносятся в CRM SotuvAI, это займёт несколько минут.',
  },
  "O'chirildi — ko'chirilgan bitimlar qoladi, lekin endi {crm} dan yangilanmaydi.": {
    en: 'Disabled — copied deals stay, but they will no longer be updated from {crm}.',
    ru: 'Выключено — перенесённые сделки останутся, но больше не будут обновляться из {crm}.',
  },
  'CRM dagi bitimlar': { en: 'Deals in CRM', ru: 'Сделок в CRM' },
  "Bitimlarni ko'rish": { en: 'View deals', ru: 'Смотреть сделки' },

  // ─── Bitim kartochkasi va Kanban ───
  "{crm} dan sinxronlanadi — nom, summa, bosqich, mas'ul va {crm} maydonlari u yerda o'zgartiriladi. Teglar, kompaniya, izoh va vazifalarni shu yerda qo'shish mumkin.":
    {
      en: 'Synced from {crm} — name, amount, stage, responsible user and {crm} fields are changed there. Tags, company, notes and tasks can be added here.',
      ru: 'Синхронизируется из {crm} — название, сумма, этап, ответственный и поля {crm} меняются там. Теги, компанию, примечания и задачи можно добавлять здесь.',
    },
  '{crm} da ochish': { en: 'Open in {crm}', ru: 'Открыть в {crm}' },
  '{crm} da o‘zgartiriladi': { en: 'Changed in {crm}', ru: 'Меняется в {crm}' },
  '{crm} dan': { en: 'From {crm}', ru: 'Из {crm}' },
  "Bu voronka {crm} dan har daqiqada sinxronlanadi — bitim bosqichi, summasi va mas'uli {crm} da o'zgartiriladi.": {
    en: "This pipeline is synced from {crm} every minute — a deal's stage, amount and responsible user are changed in {crm}.",
    ru: 'Эта воронка синхронизируется из {crm} каждую минуту — этап, сумма и ответственный сделки меняются в {crm}.',
  },

  // ─── CRM sozlamalari ───
  "Bu voronka {crm} dan sinxronlanadi — nomi, bosqichlari va ranglari {crm} da o'zgartiriladi va bu yerga avtomatik keladi.": {
    en: 'This pipeline is synced from {crm} — its name, stages and colours are changed in {crm} and arrive here automatically.',
    ru: 'Эта воронка синхронизируется из {crm} — название, этапы и цвета меняются в {crm} и приходят сюда автоматически.',
  },
  '{crm} dan sinxronlanadi': { en: 'synced from {crm}', ru: 'синхронизируется из {crm}' },
  "Hozir lidlar {crm} dan sinxronlanmoqda — takror bitim bo'lmasligi uchun qo'ng'iroqlardan qabul to'xtatilgan.": {
    en: 'Leads are currently synced from {crm} — intake from calls is paused to avoid duplicate deals.',
    ru: 'Сейчас лиды синхронизируются из {crm} — приём из звонков приостановлен, чтобы не было дублей сделок.',
  },

  // ─── Server xabarlari ───
  "Bu bitim amoCRM dan sinxronlanadi — nom, summa, bosqich va mas'ulni amoCRM da o'zgartiring": {
    en: 'This deal is synced from amoCRM — change the name, amount, stage and responsible user in amoCRM',
    ru: 'Эта сделка синхронизируется из amoCRM — меняйте название, сумму, этап и ответственного в amoCRM',
  },
  "Bu voronka amoCRM dan sinxronlanadi — nomi va bosqichlarini amoCRM da o'zgartiring": {
    en: 'This pipeline is synced from amoCRM — change its name and stages in amoCRM',
    ru: 'Эта воронка синхронизируется из amoCRM — меняйте её название и этапы в amoCRM',
  },
  "Bu maydon amoCRM dan sinxronlanadi — uni amoCRM da o'zgartiring": {
    en: 'This field is synced from amoCRM — change it in amoCRM',
    ru: 'Это поле синхронизируется из amoCRM — меняйте его в amoCRM',
  },
  // Server xabari CRM nomini ulanishdan oladi — Bitrix24 varianti ham kerak (aniq matn bo'yicha tarjima).
  "Bu bitim Bitrix24 dan sinxronlanadi — nom, summa, bosqich va mas'ulni Bitrix24 da o'zgartiring": {
    en: 'This deal is synced from Bitrix24 — change the name, amount, stage and responsible user in Bitrix24',
    ru: 'Эта сделка синхронизируется из Bitrix24 — меняйте название, сумму, этап и ответственного в Bitrix24',
  },
  "Bu voronka Bitrix24 dan sinxronlanadi — nomi va bosqichlarini Bitrix24 da o'zgartiring": {
    en: 'This pipeline is synced from Bitrix24 — change its name and stages in Bitrix24',
    ru: 'Эта воронка синхронизируется из Bitrix24 — меняйте её название и этапы в Bitrix24',
  },
  "Bu maydon Bitrix24 dan sinxronlanadi — uni Bitrix24 da o'zgartiring": {
    en: 'This field is synced from Bitrix24 — change it in Bitrix24',
    ru: 'Это поле синхронизируется из Bitrix24 — меняйте его в Bitrix24',
  },
  "CRM da sizda faqat ko'rish huquqi bor": {
    en: 'You have view-only access to the CRM',
    ru: 'В CRM у вас есть только право просмотра',
  },
};

export default CRM_SINX;
