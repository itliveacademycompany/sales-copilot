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
