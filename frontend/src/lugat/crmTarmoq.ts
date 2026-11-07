import type { Lugat } from './index';

/**
 * Ichki CRM — ijtimoiy tarmoq integratsiyalari (Facebook, Instagram, Telegram):
 * "Saralanmagan" ustunidagi ikonlar, sozlama oynasi, yo'riqnoma va server xabarlari.
 */
const CRM_TARMOQ: Lugat = {
  // ─── Ikonlar va holat ───
  'Ijtimoiy tarmoqlar': { en: 'Social networks', ru: 'Социальные сети' },
  '{nom}: ulangan': { en: '{nom}: connected', ru: '{nom}: подключено' },
  '{nom}: xato — sozlamani tekshiring': { en: '{nom}: error — check the settings', ru: '{nom}: ошибка — проверьте настройки' },
  '{nom}: ulanmagan — ulash uchun bosing': { en: '{nom}: not connected — click to connect', ru: '{nom}: не подключено — нажмите, чтобы подключить' },
  '{nom} integratsiyasi': { en: '{nom} integration', ru: 'Интеграция {nom}' },
  Sinash: { en: 'Test', ru: 'Проверить' },
  ixtiyoriy: { en: 'optional', ru: 'необязательно' },
  'Kelgan murojaatlar: {n}': { en: 'Leads received: {n}', ru: 'Получено заявок: {n}' },
  oxirgisi: { en: 'last', ru: 'последняя' },
  tekshirildi: { en: 'checked', ru: 'проверено' },
  'reklama formasi': { en: 'lead form', ru: 'лид-форма' },
  'Integratsiyani faqat rahbar sozlaydi.': { en: 'Only a manager can configure the integration.', ru: 'Настраивать интеграцию может только руководитель.' },
  'Tayyorlanmoqda…': { en: 'Preparing…', ru: 'Подготовка…' },
  'Hammasi ishlayapti': { en: 'Everything works', ru: 'Всё работает' },
  'Tekshiruv natijasi': { en: 'Check result', ru: 'Результат проверки' },
  '{n} ta lid to‘ldirildi': { en: '{n} leads filled in', ru: 'Заполнено лидов: {n}' },
  '{nom} uzilsinmi? Kalitlar o‘chiriladi, yangi lidlar kelmaydi. Kelgan murojaatlar saqlanadi.': {
    en: 'Disconnect {nom}? Keys will be deleted and new leads will stop. Received leads are kept.',
    ru: 'Отключить {nom}? Ключи будут удалены, новые заявки перестанут поступать. Полученные заявки сохранятся.',
  },
  'Saqlangan: {h} — almashtirish uchun yangisini kiriting': { en: 'Saved: {h} — enter a new one to replace', ru: 'Сохранено: {h} — введите новый, чтобы заменить' },

  // ─── Tekshiruv qadamlari ───
  'Kalit (token)': { en: 'Key (token)', ru: 'Ключ (токен)' },
  'Facebook sahifa': { en: 'Facebook Page', ru: 'Страница Facebook' },
  'Instagram hisob': { en: 'Instagram account', ru: 'Аккаунт Instagram' },
  'Sahifaga obuna (webhook)': { en: 'Page subscription (webhook)', ru: 'Подписка страницы (webhook)' },
  Webhook: { en: 'Webhook', ru: 'Webhook' },
  'Telegram holati': { en: 'Telegram status', ru: 'Статус Telegram' },
  'Qayta olingan lidlar': { en: 'Re-fetched leads', ru: 'Повторно полученные лиды' },

  // ─── Oyna bo'limlari ───
  'Qanday ulanadi — qadam-baqadam': { en: 'How to connect — step by step', ru: 'Как подключить — пошагово' },
  '1. Meta ilovasidagi webhook': { en: '1. Webhook in the Meta app', ru: '1. Webhook в приложении Meta' },
  '2. Kalitlar': { en: '2. Keys', ru: '2. Ключи' },
  '3. Lidlar qayerga tushadi': { en: '3. Where leads go', ru: '3. Куда попадают лиды' },
  'Lidlar qayerga tushadi': { en: 'Where leads go', ru: 'Куда попадают лиды' },
  'Bot kaliti': { en: 'Bot key', ru: 'Ключ бота' },
  'Callback URL': { en: 'Callback URL', ru: 'Callback URL' },
  'Verify token': { en: 'Verify token', ru: 'Verify token' },
  'Meta ilovasi → Webhooks → «{obj}» → Callback URL': { en: 'Meta app → Webhooks → “{obj}” → Callback URL', ru: 'Приложение Meta → Webhooks → «{obj}» → Callback URL' },
  'Shu matnni «Verify token» maydoniga qo‘ying va «Verify and save» bosing': {
    en: 'Paste this text into the “Verify token” field and click “Verify and save”',
    ru: 'Вставьте этот текст в поле «Verify token» и нажмите «Verify and save»',
  },
  'App Secret': { en: 'App Secret', ru: 'App Secret' },
  'Meta ilovasi → App settings → Basic → App secret': { en: 'Meta app → App settings → Basic → App secret', ru: 'Приложение Meta → App settings → Basic → App secret' },
  'Access token': { en: 'Access token', ru: 'Access token' },
  'Sahifa tokeni (Page Access Token)': { en: 'Page Access Token', ru: 'Токен страницы (Page Access Token)' },
  'Muddatsiz (long-lived) token ishlating, aks holda bir necha soatda eskiradi.': {
    en: 'Use a long-lived token, otherwise it expires within hours.',
    ru: 'Используйте долгосрочный (long-lived) токен, иначе он истечёт через несколько часов.',
  },
  'Facebook sahifa ID': { en: 'Facebook Page ID', ru: 'ID страницы Facebook' },
  'Instagram hisob ID': { en: 'Instagram account ID', ru: 'ID аккаунта Instagram' },
  'Instagram target reklama lidlari Facebook sahifa orqali keladi — sahifa ID sini kiriting. Hisob ID bo‘sh qolsa, sahifadan o‘zi aniqlanadi.': {
    en: 'Instagram ad leads arrive through the Facebook Page — enter the Page ID. If the account ID is empty, it is detected from the Page.',
    ru: 'Лиды из рекламы Instagram приходят через страницу Facebook — укажите ID страницы. Если ID аккаунта пуст, он определится по странице.',
  },
  "@BotFather → /newbot → bergan tokenni nusxalang. Dill Mind bildirishnoma botidan boshqa bot bo'lsin.": {
    en: '@BotFather → /newbot → copy the token it gives. Use a different bot from the Dill Mind notification bot.',
    ru: '@BotFather → /newbot → скопируйте выданный токен. Это должен быть другой бот, не бот уведомлений Dill Mind.',
  },
  'Webhook avtomatik o‘rnatiladi: {url}': { en: 'The webhook is set automatically: {url}', ru: 'Webhook устанавливается автоматически: {url}' },
  '/start ga javob': { en: 'Reply to /start', ru: 'Ответ на /start' },
  'Ostida «Telefon raqamni yuborish» tugmasi chiqadi. Bo‘sh qoldirilsa — javob yuborilmaydi.': {
    en: 'A “Send phone number” button appears below it. Leave empty to send no reply.',
    ru: 'Под ним появится кнопка «Отправить номер телефона». Если оставить пустым — ответ не отправляется.',
  },
  'Telefon yuborilganda javob': { en: 'Reply when a phone is shared', ru: 'Ответ после отправки телефона' },
  'Murojaat shu voronkaning «Saralanmagan» ustuniga tushadi.': { en: 'Leads go to the “Unsorted” column of this pipeline.', ru: 'Заявки попадают в колонку «Неразобранное» этой воронки.' },

  // ─── Tavsiflar ───
  'Facebook target reklama formalari (Lead Ads) va sahifaga Messenger orqali yozganlar «Saralanmagan»ga tushadi.': {
    en: 'Facebook ad lead forms (Lead Ads) and people who message your Page in Messenger go to “Unsorted”.',
    ru: 'Лид-формы рекламы Facebook (Lead Ads) и сообщения странице в Messenger попадают в «Неразобранное».',
  },
  "Instagram target reklama formalari (Lead Ads) va Direct'ga yozganlar «Saralanmagan»ga tushadi.": {
    en: 'Instagram ad lead forms (Lead Ads) and Direct messages go to “Unsorted”.',
    ru: 'Лид-формы рекламы Instagram (Lead Ads) и сообщения в Direct попадают в «Неразобранное».',
  },
  'Kompaniya botingizga yozgan mijozlar «Saralanmagan»ga tushadi: ismi, @username, xabarlari va telefoni (yuborsa).': {
    en: 'Customers who message your company bot go to “Unsorted”: name, @username, messages and phone (if shared).',
    ru: 'Клиенты, написавшие боту компании, попадают в «Неразобранное»: имя, @username, сообщения и телефон (если отправил).',
  },

  // ─── Yo'riqnoma: Facebook ───
  'developers.facebook.com → My Apps → Create app (turi: Business).': {
    en: 'developers.facebook.com → My Apps → Create app (type: Business).',
    ru: 'developers.facebook.com → My Apps → Create app (тип: Business).',
  },
  'Ilovaga «Webhooks» mahsulotini qo‘shing → «Page» → «Subscribe to this object»: quyidagi Callback URL va Verify token ni qo‘ying, so‘ng «leadgen» va «messages» maydonlariga obuna bo‘ling.': {
    en: 'Add the “Webhooks” product → “Page” → “Subscribe to this object”: paste the Callback URL and Verify token below, then subscribe to the “leadgen” and “messages” fields.',
    ru: 'Добавьте продукт «Webhooks» → «Page» → «Subscribe to this object»: вставьте Callback URL и Verify token ниже, затем подпишитесь на поля «leadgen» и «messages».',
  },
  'App settings → Basic → App secret ni nusxalang.': { en: 'Copy App settings → Basic → App secret.', ru: 'Скопируйте App settings → Basic → App secret.' },
  'Graph API Explorer yoki Business Settings → System users orqali sahifa tokenini oling: ruxsatlar — pages_show_list, pages_read_engagement, pages_manage_metadata, leads_retrieval, pages_messaging.': {
    en: 'Get a Page token via Graph API Explorer or Business Settings → System users: permissions — pages_show_list, pages_read_engagement, pages_manage_metadata, leads_retrieval, pages_messaging.',
    ru: 'Получите токен страницы через Graph API Explorer или Business Settings → System users: разрешения — pages_show_list, pages_read_engagement, pages_manage_metadata, leads_retrieval, pages_messaging.',
  },
  'Sahifa ID sini kiriting (Sahifa → About → Page transparency) va «Ulash» ni bosing — tizim tokenni tekshiradi va sahifani ilovaga obuna qiladi.': {
    en: 'Enter the Page ID (Page → About → Page transparency) and click “Connect” — the system checks the token and subscribes the Page to the app.',
    ru: 'Укажите ID страницы (Страница → Информация → Прозрачность страницы) и нажмите «Подключить» — система проверит токен и подпишет страницу на приложение.',
  },
  'Sinab ko‘rish: developers.facebook.com/tools/lead-ads-testing — test lid yuboring, u «Saralanmagan»da paydo bo‘ladi.': {
    en: 'Try it: developers.facebook.com/tools/lead-ads-testing — send a test lead, it will appear in “Unsorted”.',
    ru: 'Проверка: developers.facebook.com/tools/lead-ads-testing — отправьте тестовый лид, он появится в «Неразобранном».',
  },

  // ─── Yo'riqnoma: Instagram ───
  'Instagram hisobi professional (Business/Creator) bo‘lishi va Facebook sahifaga bog‘langan bo‘lishi kerak.': {
    en: 'The Instagram account must be professional (Business/Creator) and linked to a Facebook Page.',
    ru: 'Аккаунт Instagram должен быть профессиональным (Business/Creator) и привязан к странице Facebook.',
  },
  'developers.facebook.com → Meta ilovasi (Facebook bilan bir xil ilova bo‘lishi mumkin) → Webhooks → «Instagram» obyekti: Callback URL va Verify token ni qo‘ying, «messages» maydoniga obuna bo‘ling.': {
    en: 'developers.facebook.com → Meta app (can be the same as for Facebook) → Webhooks → “Instagram” object: paste the Callback URL and Verify token, subscribe to the “messages” field.',
    ru: 'developers.facebook.com → приложение Meta (может быть тем же, что и для Facebook) → Webhooks → объект «Instagram»: вставьте Callback URL и Verify token, подпишитесь на поле «messages».',
  },
  'App secret va token kiriting: ruxsatlar — instagram_basic, instagram_manage_messages, pages_show_list, pages_manage_metadata, leads_retrieval.': {
    en: 'Enter the App secret and token: permissions — instagram_basic, instagram_manage_messages, pages_show_list, pages_manage_metadata, leads_retrieval.',
    ru: 'Введите App secret и токен: разрешения — instagram_basic, instagram_manage_messages, pages_show_list, pages_manage_metadata, leads_retrieval.',
  },
  'Instagram reklama formalari lidlari Facebook sahifa orqali keladi — sahifa ID sini ham kiriting. Agar Facebook integratsiyasi ham ulangan bo‘lsa, lid bir marta tushadi (dubl bo‘lmaydi).': {
    en: 'Instagram lead form leads arrive through the Facebook Page — enter the Page ID too. If the Facebook integration is also connected, each lead arrives once (no duplicates).',
    ru: 'Лиды из форм Instagram приходят через страницу Facebook — укажите и ID страницы. Если подключена и интеграция Facebook, лид поступит один раз (без дублей).',
  },
  '«Ulash» ni bosing — tizim tokenni va Instagram hisobini tekshiradi.': {
    en: 'Click “Connect” — the system checks the token and the Instagram account.',
    ru: 'Нажмите «Подключить» — система проверит токен и аккаунт Instagram.',
  },

  // ─── Yo'riqnoma: Telegram ───
  'Telegram’da @BotFather ga /newbot yozing, bot nomi va @username ni bering.': {
    en: 'In Telegram, send /newbot to @BotFather and set the bot name and @username.',
    ru: 'В Telegram напишите @BotFather команду /newbot, задайте имя и @username бота.',
  },
  'BotFather bergan tokenni quyidagi maydonga qo‘ying va «Ulash» ni bosing — webhook avtomatik o‘rnatiladi.': {
    en: 'Paste the token from BotFather below and click “Connect” — the webhook is set automatically.',
    ru: 'Вставьте токен от BotFather в поле ниже и нажмите «Подключить» — webhook установится автоматически.',
  },
  'Bot havolasini (t.me/sizning_bot) reklama, Instagram bio yoki saytga qo‘ying. Har reklama uchun alohida belgi: t.me/sizning_bot?start=reklama1 — u murojaatda ko‘rinadi.': {
    en: 'Put the bot link (t.me/your_bot) in ads, Instagram bio or your website. A separate tag per ad: t.me/your_bot?start=ad1 — it shows in the lead.',
    ru: 'Разместите ссылку на бота (t.me/ваш_бот) в рекламе, био Instagram или на сайте. Отдельная метка для каждой рекламы: t.me/ваш_бот?start=reklama1 — она видна в заявке.',
  },
  'Mijoz botga yozishi bilan murojaat «Saralanmagan»ga tushadi; keyingi xabarlari shu murojaatga qo‘shiladi.': {
    en: 'As soon as a customer messages the bot, a lead appears in “Unsorted”; further messages are added to it.',
    ru: 'Как только клиент пишет боту, заявка попадает в «Неразобранное»; следующие сообщения добавляются к ней.',
  },

  // ─── Server xabarlari ───
  "Bot token formati noto'g'ri": { en: 'Invalid bot token format', ru: 'Неверный формат токена бота' },
  'Bot tokenini kiriting': { en: 'Enter the bot token', ru: 'Введите токен бота' },
  "App Secret noto'g'ri — Meta ilovasi sozlamalaridan nusxalang": { en: 'Invalid App Secret — copy it from the Meta app settings', ru: 'Неверный App Secret — скопируйте его из настроек приложения Meta' },
  "Access token noto'g'ri — bo'sh joysiz to'liq nusxalang": { en: 'Invalid access token — copy it fully, without spaces', ru: 'Неверный access token — скопируйте полностью, без пробелов' },
  'App Secret ni kiriting': { en: 'Enter the App Secret', ru: 'Введите App Secret' },
  'Access token ni kiriting': { en: 'Enter the access token', ru: 'Введите access token' },
  'Facebook sahifa ID sini kiriting': { en: 'Enter the Facebook Page ID', ru: 'Введите ID страницы Facebook' },
  "ID faqat raqamlardan iborat bo'ladi": { en: 'The ID consists of digits only', ru: 'ID состоит только из цифр' },
  'Avval kalitlarni kiriting': { en: 'Enter the keys first', ru: 'Сначала введите ключи' },
  "Bu bot Dill Mind bildirishnomalari uchun ulangan. Mijozlar uchun @BotFather'da alohida bot yarating.": {
    en: 'This bot is connected for Dill Mind notifications. Create a separate bot for customers in @BotFather.',
    ru: 'Этот бот подключён для уведомлений Dill Mind. Создайте для клиентов отдельного бота в @BotFather.',
  },
};

export default CRM_TARMOQ;
