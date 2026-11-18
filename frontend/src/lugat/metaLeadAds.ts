import type { Lugat } from './index';

/**
 * Facebook Lead Ads — "Facebook orqali ulash": integratsiya kartasi, sahifa va
 * forma tanlash oynasi, holat/diagnostika va server xabarlari (crm/metaLeadAds).
 */
const META_LEAD_ADS: Lugat = {
  // ─── Karta ───
  'Facebook Lead Ads': { en: 'Facebook Lead Ads', ru: 'Facebook Lead Ads' },
  'Facebook va Instagram reklamasidagi Instant Form lidlari': { en: 'Instant Form leads from Facebook and Instagram ads', ru: 'Лиды из Instant Form в рекламе Facebook и Instagram' },
  'Integratsiya hali sozlanmagan. Platforma administratoriga murojaat qiling.': {
    en: 'The integration is not configured yet. Contact the platform administrator.',
    ru: 'Интеграция ещё не настроена. Обратитесь к администратору платформы.',
  },
  'Administrator uchun: serverda quyidagi sozlamalar yetishmaydi — {env}. Qo‘llanma: docs/meta-lead-ads.md': {
    en: 'For the administrator: these server settings are missing — {env}. Guide: docs/meta-lead-ads.md',
    ru: 'Для администратора: на сервере не хватает настроек — {env}. Инструкция: docs/meta-lead-ads.md',
  },
  'OAuth redirect URI': { en: 'OAuth redirect URI', ru: 'OAuth redirect URI' },
  'Webhook callback URL': { en: 'Webhook callback URL', ru: 'Webhook callback URL' },
  "Facebook hisobingiz bilan kiring, sahifa va formalarni tanlang — yangi lidlar «Saralanmagan» ustuniga o'zi tushadi. Kalit yoki token kiritish shart emas.": {
    en: 'Sign in with your Facebook account and choose a Page and forms — new leads land in the “Unsorted” column automatically. No keys or tokens needed.',
    ru: 'Войдите через Facebook, выберите страницу и формы — новые лиды сами попадут в колонку «Неразобранное». Ключи и токены вводить не нужно.',
  },
  'Facebook orqali ulash': { en: 'Connect with Facebook', ru: 'Подключить через Facebook' },
  'Facebook ochilmoqda…': { en: 'Opening Facebook…', ru: 'Открываем Facebook…' },
  'Yana bir sahifa ulash': { en: 'Connect another Page', ru: 'Подключить ещё страницу' },
  '«{nom}» ulandi. Endi Lead Ads Testing Tool orqali test lid yuborib, «Saralanmagan»ga tushishini tekshiring.': {
    en: '“{nom}” is connected. Now send a test lead with the Lead Ads Testing Tool and check that it lands in “Unsorted”.',
    ru: '«{nom}» подключена. Теперь отправьте тестовый лид через Lead Ads Testing Tool и проверьте, что он попал в «Неразобранное».',
  },

  // ─── Holat ───
  Ulandi: { en: 'Connected', ru: 'Подключено' },
  'Ulanishda muammo': { en: 'Connection problem', ru: 'Проблема с подключением' },
  'Lid qabul qilindi': { en: 'Lead received', ru: 'Лид получен' },
  'Hali lid kelmagan': { en: 'No leads yet', ru: 'Лидов пока нет' },
  'Lead Ads Testing Tool orqali test lid yuboring': { en: 'Send a test lead with the Lead Ads Testing Tool', ru: 'Отправьте тестовый лид через Lead Ads Testing Tool' },
  'Webhook obunasi': { en: 'Webhook subscription', ru: 'Подписка webhook' },
  'Tanlangan formalar': { en: 'Selected forms', ru: 'Выбранные формы' },
  'Oxirgi muvaffaqiyatli sinxronlash': { en: 'Last successful sync', ru: 'Последняя успешная синхронизация' },
  '{n} ta lid tushdi': { en: '{n} leads received', ru: 'Получено лидов: {n}' },
  '{n} ta navbatda': { en: '{n} queued', ru: 'в очереди: {n}' },
  '{n} ta tanlanmagan formadan (kiritilmadi)': { en: '{n} from unselected forms (skipped)', ru: 'из невыбранных форм (пропущено): {n}' },
  '{n} ta xato': { en: '{n} errors', ru: 'ошибок: {n}' },
  'Berilmagan ruxsatlar: {r} — «Qayta ulash» da ularni bering.': {
    en: 'Missing permissions: {r} — grant them via “Reconnect”.',
    ru: 'Не выданы разрешения: {r} — выдайте их через «Переподключить».',
  },
  'Holatni tekshirish': { en: 'Check status', ru: 'Проверить статус' },
  Formalar: { en: 'Forms', ru: 'Формы' },
  '«{nom}» uzilsinmi? Yangi lidlar kelmaydi. Kelgan murojaatlar CRM da qoladi.': {
    en: 'Disconnect “{nom}”? New leads will stop. Received leads stay in the CRM.',
    ru: 'Отключить «{nom}»? Новые лиды перестанут поступать. Полученные заявки останутся в CRM.',
  },
  'Olinmagan lidlar: {n}': { en: 'Leads not received: {n}', ru: 'Неполученные лиды: {n}' },
  'Qayta ishlash': { en: 'Retry', ru: 'Повторить' },
  'qayta obuna qilindi': { en: 'resubscribed', ru: 'подписка восстановлена' },
  'Meta muddat bermagan (bekor qilinishi mumkin)': { en: 'Meta gave no expiry (it can still be revoked)', ru: 'Meta не указала срок (токен всё равно может быть отозван)' },

  // ─── Tekshiruv qadamlari, holat nomlari ───
  'Sahifa tokeni': { en: 'Page token', ru: 'Токен страницы' },
  'Token holati': { en: 'Token status', ru: 'Статус токена' },
  Ruxsatlar: { en: 'Permissions', ru: 'Разрешения' },
  'Webhook obunasi (leadgen)': { en: 'Webhook subscription (leadgen)', ru: 'Подписка webhook (leadgen)' },
  "Lidlarni o'qish (Leads Access)": { en: 'Reading leads (Leads Access)', ru: 'Чтение лидов (Leads Access)' },
  'Obuna bo‘lgan': { en: 'Subscribed', ru: 'Подписана' },
  "Obuna bo'lmagan": { en: 'Not subscribed', ru: 'Не подписана' },
  'Obuna olib tashlangan': { en: 'Unsubscribed', ru: 'Подписка снята' },
  'Ruxsat bekor qilingan': { en: 'Permission revoked', ru: 'Доступ отозван' },
  'Ruxsat yetishmaydi': { en: 'Missing permission', ru: 'Не хватает разрешения' },
  "Lidlarga kirish huquqi yo'q": { en: 'No access to leads', ru: 'Нет доступа к лидам' },
  Topilmadi: { en: 'Not found', ru: 'Не найдено' },
  'Meta limiti': { en: 'Meta rate limit', ru: 'Лимит Meta' },
  'Tarmoq xatosi': { en: 'Network error', ru: 'Ошибка сети' },

  // ─── Tanlash oynasi ───
  'Facebook Lead Ads — sahifa va formalar': { en: 'Facebook Lead Ads — Page and forms', ru: 'Facebook Lead Ads — страница и формы' },
  '1. Facebook sahifa': { en: '1. Facebook Page', ru: '1. Страница Facebook' },
  'allaqachon ulangan — sozlamalari yangilanadi': { en: 'already connected — its settings will be updated', ru: 'уже подключена — настройки будут обновлены' },
  'platformadagi boshqa tashkilotga ulangan': { en: 'connected to another organization on the platform', ru: 'подключена к другой организации на платформе' },
  "reklama (Advertise) huquqi yo'q": { en: 'no Advertise permission', ru: 'нет права на рекламу (Advertise)' },
  'Quyidagi ruxsatlar berilmadi: {r}. Ularsiz lidlar kelmaydi.': { en: 'These permissions were not granted: {r}. Leads will not arrive without them.', ru: 'Не выданы разрешения: {r}. Без них лиды не поступят.' },
  'Ruxsatlarni qayta so‘rash': { en: 'Request permissions again', ru: 'Запросить разрешения снова' },
  'Formalar yuklanmoqda…': { en: 'Loading forms…', ru: 'Загрузка форм…' },
  "Formalarni olib bo'lmadi": { en: 'Could not load forms', ru: 'Не удалось загрузить формы' },
  'Instant Form’lar': { en: 'Instant Forms', ru: 'Instant Forms' },
  "Bu sahifada Instant Form topilmadi. Avval Meta Ads Manager'da lid formasi yarating.": {
    en: 'No Instant Forms found on this Page. Create a lead form in Meta Ads Manager first.',
    ru: 'На этой странице нет Instant Form. Сначала создайте лид-форму в Meta Ads Manager.',
  },
  'Barcha faol formalarni tanlash': { en: 'Select all active forms', ru: 'Выбрать все активные формы' },
  'Faqat tanlangan formalardan kelgan lidlar CRM ga tushadi. Keyin yaratilgan yangi formani shu yerda qo‘shasiz.': {
    en: 'Only leads from selected forms go to the CRM. Add forms created later here.',
    ru: 'В CRM попадают лиды только из выбранных форм. Новые формы, созданные позже, добавляйте здесь.',
  },
  'Formalar — {nom}': { en: 'Forms — {nom}', ru: 'Формы — {nom}' },

  // ─── Meta'dan qaytish xatolari ───
  "Ulanish havolasi noto'g'ri — «Facebook orqali ulash» ni qaytadan bosing.": { en: 'The connection link is invalid — click “Connect with Facebook” again.', ru: 'Ссылка подключения недействительна — нажмите «Подключить через Facebook» ещё раз.' },
  "Ulanish havolasining muddati o'tdi — «Facebook orqali ulash» ni qaytadan bosing.": { en: 'The connection link has expired — click “Connect with Facebook” again.', ru: 'Срок ссылки подключения истёк — нажмите «Подключить через Facebook» ещё раз.' },
  'Bu ulanish havolasi allaqachon ishlatilgan — «Facebook orqali ulash» ni qaytadan bosing.': { en: 'This connection link was already used — click “Connect with Facebook” again.', ru: 'Эта ссылка подключения уже использована — нажмите «Подключить через Facebook» ещё раз.' },
  "Facebook'da ruxsat berilmadi — ulanish bekor qilindi.": { en: 'Permission was not granted on Facebook — the connection was cancelled.', ru: 'В Facebook не выдано разрешение — подключение отменено.' },
  'Integratsiya hali sozlanmagan — platforma administratoriga murojaat qiling.': { en: 'The integration is not configured yet — contact the platform administrator.', ru: 'Интеграция ещё не настроена — обратитесь к администратору платформы.' },
  "Facebook ulanishni tasdiqlamadi — birozdan keyin qaytadan urinib ko'ring.": { en: 'Facebook did not confirm the connection — try again a bit later.', ru: 'Facebook не подтвердил подключение — попробуйте немного позже.' },
  "Ruxsat berilgan Facebook sahifasi topilmadi. Meta oynasida kamida bitta sahifani tanlang — unda admin yoki reklama huquqingiz bo'lishi kerak.": {
    en: 'No Facebook Page was granted. Select at least one Page in the Meta dialog — you need admin or advertiser access to it.',
    ru: 'Не найдено ни одной разрешённой страницы Facebook. Выберите в окне Meta хотя бы одну страницу — нужны права администратора или рекламодателя.',
  },
  "Sahifalar ro'yxatiga ruxsat berilmadi — «Facebook orqali ulash» ni bosib, so'ralgan barcha ruxsatlarni bering.": {
    en: 'Access to the Page list was not granted — click “Connect with Facebook” and grant all requested permissions.',
    ru: 'Не выдан доступ к списку страниц — нажмите «Подключить через Facebook» и выдайте все запрошенные разрешения.',
  },

  // ─── "Saralanmagan" oynasidagi blok ───
  'Facebook Lead Ads — bir tugmada ulash': { en: 'Facebook Lead Ads — one-click connection', ru: 'Facebook Lead Ads — подключение в один клик' },
  'Ulangan sahifalar: {s}. Reklama formalari lidlari «Saralanmagan»ga o‘zi tushadi.': { en: 'Connected Pages: {s}. Lead form leads land in “Unsorted” automatically.', ru: 'Подключённые страницы: {s}. Лиды из форм сами попадают в «Неразобранное».' },
  'Reklama formalari (Instant Form) lidlari uchun kalit kiritish shart emas: Facebook hisobingiz bilan kiring, sahifa va formalarni tanlang.': {
    en: 'No keys needed for Instant Form leads: sign in with Facebook and choose a Page and forms.',
    ru: 'Для лидов из Instant Form ключи не нужны: войдите через Facebook и выберите страницу и формы.',
  },
  'Holat va diagnostika': { en: 'Status and diagnostics', ru: 'Статус и диагностика' },
  "Quyidagi qo'lda ulash — Messenger/Direct xabarlari yoki o'z Meta ilovangiz uchun.": {
    en: 'Manual connection below — for Messenger/Direct messages or your own Meta app.',
    ru: 'Ручное подключение ниже — для сообщений Messenger/Direct или своего приложения Meta.',
  },
  'Meta Lead Ads': { en: 'Meta Lead Ads', ru: 'Meta Lead Ads' },

  // ─── Kompaniyaning o'z Meta ilovasi (SaaS) ───
  'Meta ilovasi': { en: 'Meta app', ru: 'Приложение Meta' },
  '{nom} · App ID {id} · App Secret {h}': { en: '{nom} · App ID {id} · App Secret {h}', ru: '{nom} · App ID {id} · App Secret {h}' },
  'Platforma ilovasi ishlatilmoqda. Xohlasangiz, kompaniyangizning o‘z Meta ilovasini ulang.': {
    en: 'The platform app is in use. You can connect your company’s own Meta app instead.',
    ru: 'Используется приложение платформы. При желании подключите собственное приложение Meta вашей компании.',
  },
  'Kompaniyangizning Meta ilovasi kalitlarini bir marta kiriting — keyin «Facebook orqali ulash» paydo bo‘ladi.': {
    en: 'Enter your company’s Meta app keys once — then “Connect with Facebook” appears.',
    ru: 'Один раз введите ключи приложения Meta вашей компании — после этого появится «Подключить через Facebook».',
  },
  'Meta panelida qanday sozlanadi — qadam-baqadam': { en: 'How to set it up in the Meta dashboard — step by step', ru: 'Как настроить в панели Meta — пошагово' },
  'developers.facebook.com → My Apps → Create app (turi: Business). App settings → Basic: App ID va App secret ni pastga kiriting; App Domains — saytingiz domeni.': {
    en: 'developers.facebook.com → My Apps → Create app (type: Business). App settings → Basic: enter the App ID and App secret below; App Domains — your site domain.',
    ru: 'developers.facebook.com → My Apps → Create app (тип: Business). App settings → Basic: введите ниже App ID и App secret; App Domains — домен вашего сайта.',
  },
  '«Facebook Login for Business» mahsulotini qo‘shing → Settings: «Valid OAuth Redirect URIs» ga quyidagi redirect manzilini, «Deauthorize callback URL» ga deauthorize manzilini qo‘ying.': {
    en: 'Add the “Facebook Login for Business” product → Settings: paste the redirect URL below into “Valid OAuth Redirect URIs” and the deauthorize URL into “Deauthorize callback URL”.',
    ru: 'Добавьте продукт «Facebook Login for Business» → Settings: вставьте адрес redirect ниже в «Valid OAuth Redirect URIs», а адрес deauthorize — в «Deauthorize callback URL».',
  },
  'Facebook Login for Business → Configurations → Create: token turi «User access token», Assets — Pages, ruxsatlar: pages_show_list, pages_read_engagement, pages_manage_metadata, leads_retrieval, pages_manage_ads, ads_management. Configuration ID ni pastga kiriting.': {
    en: 'Facebook Login for Business → Configurations → Create: token type “User access token”, Assets — Pages, permissions: pages_show_list, pages_read_engagement, pages_manage_metadata, leads_retrieval, pages_manage_ads, ads_management. Enter the Configuration ID below.',
    ru: 'Facebook Login for Business → Configurations → Create: тип токена «User access token», Assets — Pages, разрешения: pages_show_list, pages_read_engagement, pages_manage_metadata, leads_retrieval, pages_manage_ads, ads_management. Введите Configuration ID ниже.',
  },
  '«Webhooks» mahsuloti → «Page»: Callback URL va Verify token ni qo‘ying → «Verify and save» → «leadgen» maydoniga obuna bo‘ling.': {
    en: '“Webhooks” product → “Page”: paste the Callback URL and Verify token → “Verify and save” → subscribe to the “leadgen” field.',
    ru: 'Продукт «Webhooks» → «Page»: вставьте Callback URL и Verify token → «Verify and save» → подпишитесь на поле «leadgen».',
  },
  'App settings → Basic: Privacy Policy URL va «Data deletion callback URL» ni kiriting. Sahifani ulaydigan xodim ilovada Admin yoki Tester bo‘lsin.': {
    en: 'App settings → Basic: enter the Privacy Policy URL and “Data deletion callback URL”. The person connecting the Page must be an Admin or Tester of the app.',
    ru: 'App settings → Basic: укажите Privacy Policy URL и «Data deletion callback URL». Сотрудник, подключающий страницу, должен быть Admin или Tester приложения.',
  },
  'Meta paneliga nusxalang': { en: 'Copy into the Meta dashboard', ru: 'Скопируйте в панель Meta' },
  'Valid OAuth Redirect URI': { en: 'Valid OAuth Redirect URI', ru: 'Valid OAuth Redirect URI' },
  'Facebook Login for Business → Settings': { en: 'Facebook Login for Business → Settings', ru: 'Facebook Login for Business → Settings' },
  'Webhook Callback URL': { en: 'Webhook Callback URL', ru: 'Webhook Callback URL' },
  'Webhooks → Page → Callback URL (kompaniyangiz uchun alohida)': { en: 'Webhooks → Page → Callback URL (unique to your company)', ru: 'Webhooks → Page → Callback URL (отдельный для вашей компании)' },
  'Webhooks → Page → Verify token': { en: 'Webhooks → Page → Verify token', ru: 'Webhooks → Page → Verify token' },
  'Deauthorize callback URL': { en: 'Deauthorize callback URL', ru: 'Deauthorize callback URL' },
  'Data deletion callback URL': { en: 'Data deletion callback URL', ru: 'Data deletion callback URL' },
  'Ilova kalitlari': { en: 'App keys', ru: 'Ключи приложения' },
  'App ID': { en: 'App ID', ru: 'App ID' },
  'Configuration ID': { en: 'Configuration ID', ru: 'Configuration ID' },
  'App Secret shifrlangan holda saqlanadi va hech kimga ko‘rsatilmaydi.': { en: 'The App Secret is stored encrypted and never shown to anyone.', ru: 'App Secret хранится в зашифрованном виде и никому не показывается.' },
  'Ilovani o‘chirish': { en: 'Remove app', ru: 'Удалить приложение' },
  'Meta ilovasi tekshirildi va saqlandi. Endi «Facebook orqali ulash» ni bosing.': { en: 'The Meta app was verified and saved. Now click “Connect with Facebook”.', ru: 'Приложение Meta проверено и сохранено. Теперь нажмите «Подключить через Facebook».' },
  'Meta ilovasi sozlamalari o‘chirilsinmi? App Secret o‘chiriladi, verify token yangilanadi.': { en: 'Remove the Meta app settings? The App Secret will be deleted and the verify token renewed.', ru: 'Удалить настройки приложения Meta? App Secret будет удалён, verify token обновится.' },
  'Avval kompaniyangizning Meta ilovasini «Holat va diagnostika» sahifasida sozlang — App ID va App Secret bir marta kiritiladi.': {
    en: 'First set up your company’s Meta app on the “Status and diagnostics” page — App ID and App Secret are entered once.',
    ru: 'Сначала настройте приложение Meta вашей компании на странице «Статус и диагностика» — App ID и App Secret вводятся один раз.',
  },
  "App ID faqat raqamlardan iborat — Meta ilovasi → App settings → Basic": { en: 'The App ID consists of digits only — Meta app → App settings → Basic', ru: 'App ID состоит только из цифр — приложение Meta → App settings → Basic' },
  'Configuration ID faqat raqamlardan iborat': { en: 'The Configuration ID consists of digits only', ru: 'Configuration ID состоит только из цифр' },
  "App Secret noto'g'ri — Meta ilovasi → App settings → Basic → App secret ni to'liq nusxalang": { en: 'Invalid App Secret — copy Meta app → App settings → Basic → App secret in full', ru: 'Неверный App Secret — скопируйте полностью: приложение Meta → App settings → Basic → App secret' },
  "Meta App ID yoki App Secret ni tasdiqlamadi — ikkalasini Meta ilovasi → App settings → Basic dan qayta nusxalang": { en: 'Meta did not accept the App ID or App Secret — copy both again from Meta app → App settings → Basic', ru: 'Meta не подтвердила App ID или App Secret — скопируйте оба заново: приложение Meta → App settings → Basic' },
  'Avval ulangan sahifalarni uzing — ular shu ilova orqali ishlaydi': { en: 'Disconnect the connected Pages first — they work through this app', ru: 'Сначала отключите подключённые страницы — они работают через это приложение' },
  'Meta ilovasi almashtirildi — «Qayta ulash» ni bosing.': { en: 'The Meta app was changed — click “Reconnect”.', ru: 'Приложение Meta изменено — нажмите «Переподключить».' },

  // ─── Server xabarlari ───
  'Integratsiya hali sozlanmagan.': { en: 'The integration is not configured yet.', ru: 'Интеграция ещё не настроена.' },
  "Facebook ruxsati bekor qilingan yoki muddati o'tgan — «Qayta ulash» ni bosing.": { en: 'Facebook access was revoked or expired — click “Reconnect”.', ru: 'Доступ Facebook отозван или истёк — нажмите «Переподключить».' },
  "Ruxsat yetishmaydi — «Qayta ulash» da barcha so'ralgan ruxsatlarni bering.": { en: 'Missing permission — grant all requested permissions via “Reconnect”.', ru: 'Не хватает разрешения — выдайте все запрошенные разрешения через «Переподключить».' },
  "Lidlarni o'qishga huquq yo'q. Meta Business Suite → Sozlamalar → Leads Access (Lidlarga kirish) bo'limida shu ilovaga va ulagan foydalanuvchiga ruxsat bering.": {
    en: 'No permission to read leads. In Meta Business Suite → Settings → Leads Access, grant access to this app and to the user who connected it.',
    ru: 'Нет доступа к лидам. В Meta Business Suite → Настройки → Leads Access (доступ к лидам) выдайте доступ этому приложению и подключившему пользователю.',
  },
  "Sahifa yoki forma topilmadi — o'chirilgan yoki ruxsat olib tashlangan bo'lishi mumkin.": { en: 'Page or form not found — it may have been deleted or access removed.', ru: 'Страница или форма не найдена — возможно, удалена или доступ отозван.' },
  "Meta so'rovlar limiti — lidlar birozdan keyin avtomatik olinadi.": { en: 'Meta rate limit — leads will be fetched automatically a bit later.', ru: 'Лимит запросов Meta — лиды будут получены автоматически чуть позже.' },
  'Meta serveri vaqtincha javob bermadi — avtomatik qayta urinish rejalashtirildi.': { en: 'Meta server did not respond — an automatic retry is scheduled.', ru: 'Сервер Meta не ответил — запланирована автоматическая повторная попытка.' },
  "Meta noma'lum xato qaytardi — avtomatik qayta urinish rejalashtirildi.": { en: 'Meta returned an unknown error — an automatic retry is scheduled.', ru: 'Meta вернула неизвестную ошибку — запланирована автоматическая повторная попытка.' },
  "Sahifa webhook'ga obuna bo'lmadi — lidlar kelmaydi. «Holatni tekshirish» yoki «Qayta ulash» ni bosing.": {
    en: 'The Page is not subscribed to the webhook — leads will not arrive. Click “Check status” or “Reconnect”.',
    ru: 'Страница не подписана на webhook — лиды не поступят. Нажмите «Проверить статус» или «Переподключить».',
  },
  'Ulash sessiyasi topilmadi — «Facebook orqali ulash» ni qaytadan bosing': { en: 'Connection session not found — click “Connect with Facebook” again', ru: 'Сессия подключения не найдена — нажмите «Подключить через Facebook» ещё раз' },
  'Tanlash vaqti tugadi — «Facebook orqali ulash» ni qaytadan bosing': { en: 'Selection time is over — click “Connect with Facebook” again', ru: 'Время выбора истекло — нажмите «Подключить через Facebook» ещё раз' },
  'Bu sahifaga ushbu ulanishda ruxsat berilmagan': { en: 'This Page was not granted in this connection', ru: 'Эта страница не разрешена в этом подключении' },
  "Bu sahifada reklama (Advertise) huquqingiz yo'q — lidlarni o'qib bo'lmaydi": { en: 'You have no Advertise permission on this Page — leads cannot be read', ru: 'У вас нет права на рекламу (Advertise) на этой странице — лиды прочитать нельзя' },
  'Kamida bitta formani tanlang': { en: 'Select at least one form', ru: 'Выберите хотя бы одну форму' },
  'Tanlangan forma bu sahifada topilmadi': { en: 'The selected form was not found on this Page', ru: 'Выбранная форма не найдена на этой странице' },
  "Bu sahifa platformadagi boshqa tashkilotga ulangan. U yerdagi ulanish uzilmaguncha bu yerga ulab bo'lmaydi — sahifa administratori bilan bog'laning.": {
    en: 'This Page is connected to another organization on the platform. It cannot be connected here until that connection is removed — contact the Page administrator.',
    ru: 'Эта страница подключена к другой организации на платформе. Пока то подключение не отключено, подключить её здесь нельзя — свяжитесь с администратором страницы.',
  },
  'Meta obunani tasdiqlamadi': { en: 'Meta did not confirm the subscription', ru: 'Meta не подтвердила подписку' },
  'Ulanish topilmadi': { en: 'Connection not found', ru: 'Подключение не найдено' },
  'Ulanish uzilgan — «Facebook orqali ulash» ni bosing': { en: 'Disconnected — click “Connect with Facebook”', ru: 'Отключено — нажмите «Подключить через Facebook»' },
  'Hodisa topilmadi yoki allaqachon ishlangan': { en: 'Event not found or already processed', ru: 'Событие не найдено или уже обработано' },
  "Sahifaning webhook obunasini olib tashlab bo'lmadi — kelgan hodisalar e'tiborsiz qoldiriladi.": {
    en: 'Could not remove the Page webhook subscription — incoming events will be ignored.',
    ru: 'Не удалось снять подписку webhook со страницы — входящие события будут игнорироваться.',
  },
};

export default META_LEAD_ADS;
