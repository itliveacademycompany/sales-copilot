import type { Lugat } from './index';

/**
 * Ichki CRM — murojaat oynasi ("Saralanmagan"dagi murojaat bosilganda):
 * kontakt, chat tarixi va mijozga javob yozish.
 */
const CRM_MUROJAAT: Lugat = {
  'Kontakt kartasi': { en: 'Contact card', ru: 'Карточка контакта' },
  Kelgan: { en: 'Received', ru: 'Поступило' },
  'Havola belgisi': { en: 'Link tag', ru: 'Метка ссылки' },
  Reklama: { en: 'Ad', ru: 'Реклама' },
  'Forma javoblari': { en: 'Form answers', ru: 'Ответы формы' },
  'Mijoz botni ishga tushirdi, hali xabar yozmagan.': {
    en: 'The client started the bot but has not written yet.',
    ru: 'Клиент запустил бота, но ещё ничего не написал.',
  },
  'Javob yozing — mijozga {t} orqali boradi': { en: 'Write a reply — it goes to the client via {t}', ru: 'Напишите ответ — он уйдёт клиенту в {t}' },
  'Javob matni': { en: 'Reply text', ru: 'Текст ответа' },
  'Xabar yuborilmadi': { en: 'Message was not sent', ru: 'Сообщение не отправлено' },
  'Bitim maydonlari': { en: 'Deal fields', ru: 'Поля сделки' },

  // ─── "Saralanmagan" ro'yxati ───
  "Qo'ng'iroqlar, ijtimoiy tarmoqlar, veb-formalar va qo'lda kiritilgan murojaatlar. Qabul qilinsa — bitim bo'ladi.": {
    en: 'Calls, social networks, web forms and manual entries. Once accepted, a request becomes a deal.',
    ru: 'Звонки, соцсети, веб-формы и заявки, введённые вручную. После принятия заявка становится сделкой.',
  },
  "Ism, telefon yoki xabar bo'yicha qidirish": { en: 'Search by name, phone or message', ru: 'Поиск по имени, телефону или сообщению' },
  '{a}–{b} / {n}': { en: '{a}–{b} of {n}', ru: '{a}–{b} из {n}' },

  // ─── Kontaktlar ro'yxati ───
  'Bitimi bor': { en: 'With deals', ru: 'Со сделками' },
  Bitimsiz: { en: 'Without deals', ru: 'Без сделок' },
  "Qo'ng'iroq qilgan": { en: 'Called', ru: 'Звонили' },
  "Mijozlar, ularning bitimlari va qo'ng'iroqlari — bitta ro'yxatda.": {
    en: 'Clients, their deals and calls — in one list.',
    ru: 'Клиенты, их сделки и звонки — в одном списке.',
  },
  Aloqa: { en: 'Contact info', ru: 'Связь' },
  'Ism kiritilmagan': { en: 'No name', ru: 'Имя не указано' },

  // ─── Kompaniyalar ro'yxati ───
  'Tashkilotlar — ularning xodimlari (kontaktlar) va bitimlari bir joyda.': {
    en: 'Organizations — their people (contacts) and deals in one place.',
    ru: 'Организации — их сотрудники (контакты) и сделки в одном месте.',
  },
  'Kontaktlarda {n} ta kompaniya nomi yozilgan': { en: 'Contacts mention {n} company names', ru: 'В контактах указано {n} названий компаний' },
  "{k} ta kontakt hali kompaniyaga bog'lanmagan. Ularni kompaniya qilib, kontakt va bitimlarini bog'lash mumkin.": {
    en: '{k} contacts are not linked to a company yet. You can turn them into companies and link the contacts and their deals.',
    ru: '{k} контактов ещё не привязаны к компании. Их можно превратить в компании и привязать контакты и их сделки.',
  },
  "Nomi bo'yicha": { en: 'By name', ru: 'По названию' },
  'Ochiq bitimlar summasi': { en: 'Open deals amount', ru: 'Сумма открытых сделок' },
  "Hali kompaniya yo'q": { en: 'No companies yet', ru: 'Компаний пока нет' },
  "Kompaniya bir tashkilotning kontaktlari va bitimlarini bir joyga yig'adi — masalan, bitta maktab yoki firma xodimlari va ular bilan bitimlar.": {
    en: 'A company groups the contacts and deals of one organization — for example, the staff of a school or firm and the deals with them.',
    ru: 'Компания объединяет контакты и сделки одной организации — например, сотрудников школы или фирмы и сделки с ними.',
  },
  'Kontaktlardan yaratish ({n})': { en: 'Create from contacts ({n})', ru: 'Создать из контактов ({n})' },
  "Sayt ko'rsatilmagan": { en: 'No website', ru: 'Сайт не указан' },
  'Ochiq: {o} · Jami: {j}': { en: 'Open: {o} · Total: {j}', ru: 'Открытых: {o} · Всего: {j}' },
  "{c} ta kompaniya yaratildi, {k} ta kontakt va {b} ta bitim bog'landi.": {
    en: '{c} companies created, {k} contacts and {b} deals linked.',
    ru: 'Создано компаний: {c}, привязано контактов: {k} и сделок: {b}.',
  },
  'Kamida bitta nom tanlang': { en: 'Select at least one name', ru: 'Выберите хотя бы одно название' },
  'Kontaktlardan kompaniya yaratish': { en: 'Create companies from contacts', ru: 'Создать компании из контактов' },
  'Yaratish va bog‘lash ({n})': { en: 'Create and link ({n})', ru: 'Создать и привязать ({n})' },
  "Kontaktlarning «Kompaniya» maydoniga yozilgan nomlar. Tanlanganlari kompaniya bo'ladi, shu nomdagi kontaktlar va ularning bitimlari unga bog'lanadi.": {
    en: 'Names written in the contacts’ “Company” field. Selected ones become companies; contacts with that name and their deals get linked.',
    ru: 'Названия из поля «Компания» в контактах. Выбранные станут компаниями, к ним привяжутся контакты с этим названием и их сделки.',
  },
  'Nom bo‘yicha qidirish': { en: 'Search by name', ru: 'Поиск по названию' },
  'Hammasini belgilash': { en: 'Select all', ru: 'Выбрать все' },
  'Kompaniya bor — bog‘lanadi': { en: 'Exists — will be linked', ru: 'Уже есть — привяжется' },
  '{n} ta kontakt': { en: '{n} contacts', ru: 'контактов: {n}' },
  'Tahrirlanmoqda — maydondan chiqqach saqlanadi': { en: 'Editing — saved when you leave the field', ru: 'Редактирование — сохранится, когда выйдете из поля' },
  "Mas'ulni faqat rahbar tanlaydi": { en: 'Only a manager can choose the responsible user', ru: 'Ответственного выбирает только руководитель' },

  // ─── Server xabarlari ───
  'Xabar matnini kiriting': { en: 'Enter the message text', ru: 'Введите текст сообщения' },
  'Xabar juda uzun': { en: 'The message is too long', ru: 'Сообщение слишком длинное' },
  'Mijoz botni bloklagan — xabar yetkazilmadi': { en: 'The client has blocked the bot — message not delivered', ru: 'Клиент заблокировал бота — сообщение не доставлено' },
  'Telegram ulanmagan': { en: 'Telegram is not connected', ru: 'Telegram не подключён' },
  "Bu murojaatga javob yozib bo'lmaydi": { en: 'You cannot reply to this request', ru: 'На эту заявку нельзя ответить' },
  "Mijoz oxirgi marta 24 soatdan oldin yozgan — Meta qoidasiga ko'ra mijoz qayta yozmaguncha javob yuborib bo'lmaydi.": {
    en: 'The client last wrote more than 24 hours ago — under Meta rules you cannot reply until the client writes again.',
    ru: 'Клиент писал более 24 часов назад — по правилам Meta ответить можно только после нового сообщения клиента.',
  },
};

export default CRM_MUROJAAT;
