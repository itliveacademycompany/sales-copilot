import type { Lugat } from './index';

/**
 * CRM sahifasi (`pages/Crm.tsx`), CRM adapterlari matnlari
 * (`backend/src/integrations/crm/*` — qo'llanma, maydonlar) va server xabarlari.
 */
const CRM: Lugat = {
  CRM: { en: 'CRM', ru: 'CRM' },
  "CRM tizimingizni ulang — SotuvAI har qo'ng'iroq tahlilini mijozning sdelkasiga yozadi va menejerga vazifa qo'yadi.": {
    en: 'Connect your CRM — SotuvAI writes every call analysis to the client’s deal and sets a task for the manager.',
    ru: 'Подключите CRM — SotuvAI запишет анализ каждого звонка в сделку клиента и поставит задачу менеджеру.',
  },
  'Boshqa CRM': { en: 'Other CRM', ru: 'Другая CRM' },
  "Ro'yxatda yo'q CRM ga vazifalarni imzolangan webhook orqali yuborish mumkin (n8n, Make yoki CRM ning o'z webhooki).": {
    en: 'For a CRM not on the list, tasks can be sent via a signed webhook (n8n, Make or the CRM’s own webhook).',
    ru: 'В CRM, которой нет в списке, задачи можно отправлять через подписанный webhook (n8n, Make или webhook самой CRM).',
  },
  'Webhook orqali': { en: 'Via webhook', ru: 'Через webhook' },
  'Qanday ishlaydi': { en: 'How it works', ru: 'Как это работает' },
  'CRM ni ulang': { en: 'Connect your CRM', ru: 'Подключите CRM' },
  'Kalitni bir marta kiriting — SotuvAI uni CRM da tekshiradi va shifrlab saqlaydi.': {
    en: 'Enter the key once — SotuvAI checks it in the CRM and stores it encrypted.',
    ru: 'Введите ключ один раз — SotuvAI проверит его в CRM и сохранит в зашифрованном виде.',
  },
  "Qo'ng'iroq tahlil qilinadi": { en: 'The call is analysed', ru: 'Звонок анализируется' },
  "Har qo'ng'iroq mijoz telefoni bo'yicha CRM dagi ochiq sdelkaga bog'lanadi.": {
    en: 'Each call is linked to the open deal in the CRM by the client’s phone.',
    ru: 'Каждый звонок привязывается к открытой сделке в CRM по телефону клиента.',
  },
  'Natija CRM ga yoziladi': { en: 'The result goes to the CRM', ru: 'Результат записывается в CRM' },
  "Sdelkada baho, xulosa va keyingi qadam izohi paydo bo'ladi, menejerga vazifa tushadi.": {
    en: 'A note with the score, summary and next step appears on the deal, and the manager gets a task.',
    ru: 'В сделке появляется примечание с оценкой, итогом и следующим шагом, а менеджер получает задачу.',
  },
  "Har qo'ng'iroq tahlili sdelkaga izoh bo'lib yoziladi, vazifalar menejerga tushadi.": {
    en: 'Every call analysis is written to the deal as a note, and tasks go to the manager.',
    ru: 'Анализ каждого звонка записывается в сделку примечанием, задачи уходят менеджеру.',
  },

  // ─── Karta va holat ───
  ulangan: { en: 'connected', ru: 'подключено' },
  ulanmagan: { en: 'not connected', ru: 'не подключено' },
  xato: { en: 'error', ru: 'ошибка' },
  Hisob: { en: 'Account', ru: 'Аккаунт' },
  Kalit: { en: 'Key', ru: 'Ключ' },
  Ulangan: { en: 'Connected', ru: 'Подключено' },
  'Oxirgi tekshiruv': { en: 'Last check', ru: 'Последняя проверка' },
  '{nom} hisobi ulandi': { en: '{nom} account connected', ru: 'Аккаунт {nom} подключён' },
  'Ulanish ishlayapti': { en: 'The connection works', ru: 'Подключение работает' },
  'Ulanishda xato': { en: 'Connection error', ru: 'Ошибка подключения' },
  'Yangi kalit kiriting yoki ulanishni qayta tekshiring.': {
    en: 'Enter a new key or check the connection again.',
    ru: 'Введите новый ключ или проверьте подключение ещё раз.',
  },
  'Token muddati tugagan — CRM da yangisini yarating.': {
    en: 'The token has expired — create a new one in the CRM.',
    ru: 'Срок действия токена истёк — создайте новый в CRM.',
  },
  'Token {n} kundan keyin tugaydi — oldindan yangisini yarating.': {
    en: 'The token expires in {n} days — create a new one in advance.',
    ru: 'Токен истекает через {n} дн. — создайте новый заранее.',
  },

  // ─── Tugmalar ───
  Ulash: { en: 'Connect', ru: 'Подключить' },
  Uzish: { en: 'Disconnect', ru: 'Отключить' },
  'Uzilmoqda…': { en: 'Disconnecting…', ru: 'Отключение…' },
  'Ulanishni tekshirish': { en: 'Check connection', ru: 'Проверить подключение' },
  'Kalitni almashtirish': { en: 'Replace key', ru: 'Заменить ключ' },
  'Avval {nom} ni uzing — bir vaqtda bitta CRM ulanadi.': {
    en: 'Disconnect {nom} first — only one CRM can be connected at a time.',
    ru: 'Сначала отключите {nom} — одновременно подключается только одна CRM.',
  },
  '{nom} uzilsinmi? Kalit o‘chiriladi, CRM dagi maʼlumotlarga tegilmaydi.': {
    en: 'Disconnect {nom}? The key will be deleted; data in the CRM stays untouched.',
    ru: 'Отключить {nom}? Ключ будет удалён, данные в CRM не затрагиваются.',
  },

  // ─── Ulash formasi ───
  'Kalitni qayerdan olaman?': { en: 'Where do I get the key?', ru: 'Где взять ключ?' },
  'Kalitni hech kimga, jumladan chatga yubormang — faqat shu maydonga kiriting.': {
    en: 'Never send the key to anyone, including in a chat — only enter it in this field.',
    ru: 'Никому не отправляйте ключ, в том числе в чат, — вводите его только в это поле.',
  },
  "Bo'sh qoldirsangiz saqlangan kalit ishlatiladi.": {
    en: 'Leave empty to keep the saved key.',
    ru: 'Оставьте пустым, чтобы использовать сохранённый ключ.',
  },
  "Kalitni ko'rsatish": { en: 'Show key', ru: 'Показать ключ' },
  'Kalitni yashirish': { en: 'Hide key', ru: 'Скрыть ключ' },

  // ─── Tahlildan keyin CRM ga ───
  'Tahlildan keyin CRM ga': { en: 'After analysis, to the CRM', ru: 'После анализа — в CRM' },
  'Sdelkaga izoh yozish': { en: 'Add a note to the deal', ru: 'Добавлять примечание в сделку' },
  'Baho, qisqa xulosa, asosiy kamchilik, keyingi qadam va SotuvAI dagi havola.': {
    en: 'Score, short summary, main gap, next step and a link to SotuvAI.',
    ru: 'Оценка, краткий итог, главная ошибка, следующий шаг и ссылка на SotuvAI.',
  },
  'Menejerga vazifa yaratish': { en: 'Create a task for the manager', ru: 'Создавать задачу менеджеру' },
  "Tahlil vazifa topsa (qayta qo'ng'iroq, va'da), u sdelkaning mas'uliga CRM da vazifa bo'lib tushadi.": {
    en: 'If the analysis finds a task (call back, a promise), it lands in the CRM as a task for the deal owner.',
    ru: 'Если анализ находит задачу (перезвонить, обещание), она попадает в CRM задачей ответственному по сделке.',
  },
  "Mijoz telefoni bo'yicha CRM dagi ochiq sdelka topiladi (bo'lmasa — kontakt).": {
    en: 'The open deal in the CRM is found by the client’s phone (or the contact, if there is no deal).',
    ru: 'Открытая сделка в CRM находится по телефону клиента (если сделки нет — контакт).',
  },
  "Mijoz telefoni bo'yicha CRM dagi ochiq sdelka topiladi (bo'lmasa — kontakt). Faqat {sana} dan keyin tahlil qilingan qo'ng'iroqlar yoziladi.": {
    en: 'The open deal in the CRM is found by the client’s phone (or the contact, if there is no deal). Only calls analysed after {sana} are written.',
    ru: 'Открытая сделка в CRM находится по телефону клиента (если сделки нет — контакт). Записываются только звонки, проанализированные после {sana}.',
  },

  // ─── Faoliyat ───
  Faoliyat: { en: 'Activity', ru: 'Активность' },
  "CRM ga yozilgan qo'ng'iroq": { en: 'Calls written to CRM', ru: 'Звонков записано в CRM' },
  'CRM da topilmadi': { en: 'Not found in CRM', ru: 'Не найдено в CRM' },
  'Xato (qayta uriniladi)': { en: 'Errors (will retry)', ru: 'Ошибки (повторится)' },
  "Hali hech narsa yozilmadi. Yangi qo'ng'iroq tahlil qilingach, bu yerda ko'rinadi.": {
    en: 'Nothing written yet. It will appear here once a new call is analysed.',
    ru: 'Пока ничего не записано. Появится здесь после анализа нового звонка.',
  },
  yozildi: { en: 'written', ru: 'записано' },
  "o'tkazildi": { en: 'skipped', ru: 'пропущено' },
  Izoh: { en: 'Note', ru: 'Примечание' },
  Vazifa: { en: 'Task', ru: 'Задача' },
  sdelka: { en: 'deal', ru: 'сделка' },
  kontakt: { en: 'contact', ru: 'контакт' },
  suhbat: { en: 'call', ru: 'звонок' },
  "Mijoz telefoni yo'q": { en: 'No client phone', ru: 'Нет телефона клиента' },
  'CRM da bu raqamli kontakt topilmadi': { en: 'No contact with this number in the CRM', ru: 'В CRM нет контакта с этим номером' },

  // ─── Hisob tuzilishi ───
  'Hisob tuzilishi: voronkalar va foydalanuvchilar': {
    en: 'Account structure: pipelines and users',
    ru: 'Структура аккаунта: воронки и пользователи',
  },
  "CRM ma'lumotini olib bo'lmadi": { en: "Couldn't load CRM data", ru: 'Не удалось получить данные CRM' },
  'Voronka##soni': { en: 'Pipelines', ru: 'Воронки' },
  'Bosqich##soni': { en: 'Stages', ru: 'Этапы' },
  'Foydalanuvchi##soni': { en: 'Users', ru: 'Пользователи' },
  'Sdelka maydoni': { en: 'Deal fields', ru: 'Поля сделки' },
  asosiy: { en: 'main', ru: 'основная' },
  '{nom} bosqichlari': { en: '{nom} stages', ru: 'Этапы воронки {nom}' },
  Foydalanuvchilar: { en: 'Users', ru: 'Пользователи' },
  admin: { en: 'admin', ru: 'админ' },
  nofaol: { en: 'inactive', ru: 'неактивен' },

  // ─── Adapter matnlari: amoCRM ───
  "Sdelkalar, kontaktlar va qo'ng'iroqlar": { en: 'Deals, contacts and calls', ru: 'Сделки, контакты и звонки' },
  'amoCRM da amoМаркет → yuqori o‘ng burchakdagi «⋯» → «Создать интеграцию» → «Внешняя интеграция» ni tanlang.': {
    en: 'In amoCRM, open amoМаркет → «⋯» in the top-right corner → «Создать интеграцию» → choose «Внешняя интеграция» (external integration).',
    ru: 'В amoCRM откройте amoМаркет → «⋯» в правом верхнем углу → «Создать интеграцию» → выберите «Внешняя интеграция».',
  },
  '«Ссылка для перенаправления» ga istalgan https manzil yozing (masalan amoCRM hisobingiz manzili), «Предоставить доступ: Все» ni belgilang, «Название интеграции» ga «SotuvAI» deb yozing va «Сохранить» ni bosing.': {
    en: 'In «Ссылка для перенаправления» enter any https address (e.g. your amoCRM account address), tick «Предоставить доступ: Все», name it «SotuvAI» in «Название интеграции» and click «Сохранить».',
    ru: 'В «Ссылка для перенаправления» укажите любой https-адрес (например, адрес вашего аккаунта amoCRM), отметьте «Предоставить доступ: Все», в «Название интеграции» напишите «SotuvAI» и нажмите «Сохранить».',
  },
  'Ochilgan integratsiya oynasida «Ключи и доступы» bo‘limiga o‘ting va «Долгосрочный токен» yarating.': {
    en: 'In the integration window that opens, go to the «Ключи и доступы» tab and create a «Долгосрочный токен» (long-lived token).',
    ru: 'В открывшемся окне интеграции перейдите во вкладку «Ключи и доступы» и создайте «Долгосрочный токен».',
  },
  'Muddatini tanlang (uzoqroq — qulayroq), «eyJ…» bilan boshlanadigan tokenni to‘liq nusxalab shu yerga qo‘ying.': {
    en: 'Choose the expiry (longer is more convenient), copy the whole token starting with «eyJ…» and paste it here.',
    ru: 'Выберите срок действия (чем дольше — тем удобнее), скопируйте весь токен, начинающийся с «eyJ…», и вставьте сюда.',
  },
  'Hisob manzili': { en: 'Account address', ru: 'Адрес аккаунта' },
  'Brauzerdagi amoCRM manzilini nusxalab qo‘yishingiz mumkin.': {
    en: 'You can paste the amoCRM address straight from your browser.',
    ru: 'Можно вставить адрес amoCRM прямо из браузера.',
  },
  'Uzoq muddatli token': { en: 'Long-lived token', ru: 'Долгосрочный токен' },

  // ─── Adapter matnlari: Bitrix24 ───
  'Sdelkalar, kontaktlar va ishlar': { en: 'Deals, contacts and activities', ru: 'Сделки, контакты и дела' },
  'Bitrix24 da «Разработчикам» → «Другое» → «Входящий вебхук» ni oching.': {
    en: 'In Bitrix24, open «Разработчикам» → «Другое» → «Входящий вебхук» (incoming webhook).',
    ru: 'В Bitrix24 откройте «Разработчикам» → «Другое» → «Входящий вебхук».',
  },
  '«Настройка прав» da «CRM (crm)» va «Пользователи (user)» ni belgilang.': {
    en: 'In «Настройка прав», tick «CRM (crm)» and «Пользователи (user)».',
    ru: 'В «Настройка прав» отметьте «CRM (crm)» и «Пользователи (user)».',
  },
  '«Сохранить» ni bosing va «Вебхук для вызова rest api» manzilini nusxalab shu yerga qo‘ying.': {
    en: 'Click «Сохранить», copy the «Вебхук для вызова rest api» address and paste it here.',
    ru: 'Нажмите «Сохранить», скопируйте адрес «Вебхук для вызова rest api» и вставьте сюда.',
  },
  'Webhook manzili': { en: 'Webhook address', ru: 'Адрес вебхука' },
  'Manzilning o‘zi kalit vazifasini bajaradi — uni hech kimga bermang.': {
    en: 'The address itself works as the key — never share it.',
    ru: 'Сам адрес работает как ключ — никому его не передавайте.',
  },

  // ─── Server xabarlari ───
  'CRM ulanmagan': { en: 'The CRM is not connected', ru: 'CRM не подключена' },
  "Bunday CRM qo'llab-quvvatlanmaydi": { en: 'This CRM is not supported', ru: 'Эта CRM не поддерживается' },
  "Manzil noto'g'ri. Masalan: kompaniya.amocrm.ru": {
    en: 'Invalid address. Example: company.amocrm.ru',
    ru: 'Неверный адрес. Например: company.amocrm.ru',
  },
  'Uzoq muddatli tokenni kiriting': { en: 'Enter the long-lived token', ru: 'Введите долгосрочный токен' },
  'Token muddati tugagan — amoCRM da yangisini yarating': {
    en: 'The token has expired — create a new one in amoCRM',
    ru: 'Срок действия токена истёк — создайте новый в amoCRM',
  },
  "Token noto'g'ri, muddati tugagan yoki amoCRM da bekor qilingan": {
    en: 'The token is invalid, expired or revoked in amoCRM',
    ru: 'Токен неверный, истёк или отозван в amoCRM',
  },
  "amoCRM hisobi to'lanmagan yoki bloklangan": { en: 'The amoCRM account is unpaid or blocked', ru: 'Аккаунт amoCRM не оплачен или заблокирован' },
  "Tokenga bu ma'lumotni o'qishga ruxsat berilmagan": { en: 'The token is not allowed to read this data', ru: 'У токена нет доступа к этим данным' },
  'amoCRM hisobi topilmadi — manzilni tekshiring': { en: 'amoCRM account not found — check the address', ru: 'Аккаунт amoCRM не найден — проверьте адрес' },
  "amoCRM so'rovlar limitiga yetildi — birozdan keyin qayta urinib ko'ring": {
    en: 'amoCRM request limit reached — please try again shortly',
    ru: 'Достигнут лимит запросов amoCRM — повторите чуть позже',
  },
  "amoCRM ga ulanib bo'lmadi — manzil va internetni tekshiring": {
    en: "Couldn't reach amoCRM — check the address and internet connection",
    ru: 'Не удалось подключиться к amoCRM — проверьте адрес и интернет',
  },
  "amoCRM javobini o'qib bo'lmadi": { en: "Couldn't read the amoCRM response", ru: 'Не удалось прочитать ответ amoCRM' },
  "amoCRM hisob ma'lumotini qaytarmadi": { en: 'amoCRM did not return account details', ru: 'amoCRM не вернула данные аккаунта' },
  "amoCRM voronkalar ro'yxatini o'qib bo'lmadi": { en: "Couldn't read the amoCRM pipeline list", ru: 'Не удалось прочитать список воронок amoCRM' },
  'amoCRM manzili saqlanmagan — qayta ulang': { en: 'The amoCRM address is not saved — reconnect', ru: 'Адрес amoCRM не сохранён — подключите заново' },
  'Webhook manzilini kiriting': { en: 'Enter the webhook address', ru: 'Введите адрес вебхука' },
  "Webhook manzili noto'g'ri. Masalan: https://kompaniya.bitrix24.ru/rest/1/abc123…/": {
    en: 'Invalid webhook address. Example: https://company.bitrix24.ru/rest/1/abc123…/',
    ru: 'Неверный адрес вебхука. Например: https://company.bitrix24.ru/rest/1/abc123…/',
  },
  "Webhook manzili noto'g'ri yoki Bitrix24 da o'chirilgan": {
    en: 'The webhook address is invalid or was deleted in Bitrix24',
    ru: 'Адрес вебхука неверный или удалён в Bitrix24',
  },
  'Webhookka «CRM» ruxsati berilmagan — Bitrix24 da webhook ruxsatlarini tekshiring': {
    en: 'The webhook has no «CRM» permission — check the webhook permissions in Bitrix24',
    ru: 'У вебхука нет права «CRM» — проверьте права вебхука в Bitrix24',
  },
  "Bitrix24 portali to'lanmagan yoki bloklangan": { en: 'The Bitrix24 portal is unpaid or blocked', ru: 'Портал Bitrix24 не оплачен или заблокирован' },
  'Bitrix24 portali topilmadi — webhook manzilini tekshiring': {
    en: 'Bitrix24 portal not found — check the webhook address',
    ru: 'Портал Bitrix24 не найден — проверьте адрес вебхука',
  },
  "Bitrix24 so'rovlar limitiga yetildi — birozdan keyin qayta urinib ko'ring": {
    en: 'Bitrix24 request limit reached — please try again shortly',
    ru: 'Достигнут лимит запросов Bitrix24 — повторите чуть позже',
  },
  "Bitrix24 ga ulanib bo'lmadi — manzil va internetni tekshiring": {
    en: "Couldn't reach Bitrix24 — check the address and internet connection",
    ru: 'Не удалось подключиться к Bitrix24 — проверьте адрес и интернет',
  },
  'Bitrix24 webhook manzili saqlanmagan — qayta ulang': {
    en: 'The Bitrix24 webhook address is not saved — reconnect',
    ru: 'Адрес вебхука Bitrix24 не сохранён — подключите заново',
  },
  // ─── Bir tugmada ulash (amoCRM OAuth) ───
  'amoCRM bilan ulash': { en: 'Connect with amoCRM', ru: 'Подключить через amoCRM' },
  'Token bilan ulash': { en: 'Connect with a token', ru: 'Подключить по токену' },
  'amoCRM ga o‘tilmoqda…': { en: 'Redirecting to amoCRM…', ru: 'Переход в amoCRM…' },
  'Qayta ulash': { en: 'Reconnect', ru: 'Переподключить' },
  'Bir tugmada (OAuth)': { en: 'One-click (OAuth)', ru: 'В одну кнопку (OAuth)' },
  "token o'zi yangilanadi": { en: 'the token renews itself', ru: 'токен обновляется сам' },
  'Bir tugmada ulash hali sozlanmagan': { en: 'One-click connection is not set up yet', ru: 'Подключение в одну кнопку ещё не настроено' },
  'Bir tugmada ulash hali sozlanmagan — hozircha «Token bilan ulash» dan foydalaning.': {
    en: 'One-click connection is not set up yet — use «Connect with a token» for now.',
    ru: 'Подключение в одну кнопку ещё не настроено — пока используйте «Подключить по токену».',
  },
  '«amoCRM bilan ulash» — amoCRM o‘zi hisobingizni so‘raydi, siz faqat ruxsat berasiz. Token nusxalash shart emas.': {
    en: '«Connect with amoCRM» — amoCRM asks for your account itself, you just grant access. No token copying needed.',
    ru: '«Подключить через amoCRM» — amoCRM сама запросит аккаунт, вы только даёте доступ. Копировать токен не нужно.',
  },
  'amoCRM bir tugmada ulandi. Lidlar bir necha daqiqada keladi.': {
    en: 'amoCRM connected in one click. Leads will arrive within a few minutes.',
    ru: 'amoCRM подключена в одну кнопку. Лиды появятся в течение нескольких минут.',
  },
  "Ulanish havolasi eskirgan yoki noto'g'ri — «amoCRM bilan ulash» ni qaytadan bosing.": {
    en: 'The connection link is outdated or invalid — click «Connect with amoCRM» again.',
    ru: 'Ссылка подключения устарела или неверна — нажмите «Подключить через amoCRM» ещё раз.',
  },
  'amoCRM da ruxsat berilmadi — ulanish bekor qilindi.': { en: 'Access was not granted in amoCRM — the connection was cancelled.', ru: 'В amoCRM не дан доступ — подключение отменено.' },
  'amoCRM hisob manzili aniqlanmadi — qaytadan urinib ko‘ring.': { en: 'The amoCRM account address could not be determined — please try again.', ru: 'Не удалось определить адрес аккаунта amoCRM — попробуйте ещё раз.' },
  'Bir tugmada ulash hali sozlanmagan — platforma administratoriga murojaat qiling.': {
    en: 'One-click connection is not set up yet — contact the platform administrator.',
    ru: 'Подключение в одну кнопку ещё не настроено — обратитесь к администратору платформы.',
  },
  'Avval ulangan boshqa CRM ni uzing — bir vaqtda bitta CRM ulanadi.': {
    en: 'Disconnect the other CRM first — only one CRM can be connected at a time.',
    ru: 'Сначала отключите другую CRM — одновременно подключается только одна.',
  },
  "amoCRM ulanishni tasdiqlamadi — birozdan keyin qaytadan urinib ko'ring.": {
    en: 'amoCRM did not confirm the connection — please try again a bit later.',
    ru: 'amoCRM не подтвердила подключение — повторите чуть позже.',
  },
  "Ulab bo'lmadi": { en: "Couldn't connect", ru: 'Не удалось подключить' },

  // ─── Lidlar (CRM sahifasi) ───
  Lidlar: { en: 'Leads', ru: 'Лиды' },
  'SotuvAI dagi lidlar': { en: 'Leads in SotuvAI', ru: 'Лидов в SotuvAI' },
  'Birinchi import davom etmoqda — sdelkalar sahifama-sahifa olinmoqda.': {
    en: 'The first import is in progress — deals are being fetched page by page.',
    ru: 'Идёт первый импорт — сделки загружаются постранично.',
  },
  "Har daqiqada yangi va o'zgargan sdelkalar olinadi.": { en: 'New and changed deals are fetched every minute.', ru: 'Новые и изменённые сделки загружаются каждую минуту.' },
  'Oxirgi yangilanish: {vaqt}': { en: 'Last update: {vaqt}', ru: 'Последнее обновление: {vaqt}' },
  'Hali yangilanmagan': { en: 'Not updated yet', ru: 'Ещё не обновлялось' },
  '{n} ta voronka tanlangan': { en: '{n} pipelines selected', ru: 'Выбрано воронок: {n}' },
  'barcha voronkalar': { en: 'all pipelines', ru: 'все воронки' },
  'Qaysi voronkalardagi lidlar olinsin?': { en: 'Which pipelines should leads be taken from?', ru: 'Из каких воронок брать лиды?' },
  'Voronkalar saqlandi — lidlar qaytadan import qilinadi.': { en: 'Pipelines saved — leads will be re-imported.', ru: 'Воронки сохранены — лиды будут импортированы заново.' },
  "Lidlarni ko'rish": { en: 'View leads', ru: 'Смотреть лиды' },
  'Hozir yangilash': { en: 'Update now', ru: 'Обновить сейчас' },
  'Yangilanmoqda…': { en: 'Updating…', ru: 'Обновление…' },
  'Voronkalarni tanlash': { en: 'Choose pipelines', ru: 'Выбрать воронки' },
  '{n} ta lid yangilandi.': { en: '{n} leads updated.', ru: 'Обновлено лидов: {n}.' },
  'Yangi o‘zgarish yo‘q.': { en: 'No new changes.', ru: 'Новых изменений нет.' },
  'Saqlanmoqda…': { en: 'Saving…', ru: 'Сохранение…' },

  // ─── CRM lidlari (Lid xulosalari sahifasi) ───
  "Lidlar ko'rinishi": { en: 'Leads view', ru: 'Вид лидов' },
  'AI xulosalari': { en: 'AI summaries', ru: 'AI-сводки' },
  'CRM lidlari': { en: 'CRM leads', ru: 'Лиды CRM' },
  '{crm} dagi sdelkalar — har daqiqada yangilanadi': { en: 'Deals in {crm} — updated every minute', ru: 'Сделки в {crm} — обновляются каждую минуту' },
  'Ulangan CRM dagi sdelkalar': { en: 'Deals in the connected CRM', ru: 'Сделки в подключённой CRM' },
  'CRM ni ulang — sdelkalar shu yerga avtomatik tushadi va har qo‘ng‘iroq o‘z lidiga bog‘lanadi.': {
    en: 'Connect a CRM — deals will appear here automatically and every call will be linked to its lead.',
    ru: 'Подключите CRM — сделки появятся здесь автоматически, а каждый звонок привяжется к своему лиду.',
  },
  'CRM ni ulash': { en: 'Connect a CRM', ru: 'Подключить CRM' },
  "Rahbaringizdan CRM ni ulashni so'rang.": { en: 'Ask your manager to connect the CRM.', ru: 'Попросите руководителя подключить CRM.' },
  'Lidlar {crm} dan import qilinmoqda — hozircha {n} ta. Birinchi import bir necha daqiqa olishi mumkin.': {
    en: 'Leads are being imported from {crm} — {n} so far. The first import may take a few minutes.',
    ru: 'Лиды импортируются из {crm} — пока {n}. Первый импорт может занять несколько минут.',
  },
  'Oxirgi importda xato: {xato}': { en: 'Last import error: {xato}', ru: 'Ошибка последнего импорта: {xato}' },
  'CRM sozlamalari': { en: 'CRM settings', ru: 'Настройки CRM' },
  'Ism, sdelka yoki telefon': { en: 'Name, deal or phone', ru: 'Имя, сделка или телефон' },
  'Lidlarni qidirish': { en: 'Search leads', ru: 'Поиск лидов' },
  'Barcha voronkalar': { en: 'All pipelines', ru: 'Все воронки' },
  'Barcha bosqichlar': { en: 'All stages', ru: 'Все этапы' },
  'Avval voronkani tanlang': { en: 'Choose a pipeline first', ru: 'Сначала выберите воронку' },
  Jarayonda: { en: 'In progress', ru: 'В работе' },
  Sotildi: { en: 'Won', ru: 'Успешно' },
  Yopilgan: { en: 'Lost', ru: 'Закрыто' },
  '{n} ta lid': { en: '{n} leads', ru: 'Лидов: {n}' },
  'yangilandi: {vaqt}': { en: 'updated: {vaqt}', ru: 'обновлено: {vaqt}' },
  'Lid topilmadi': { en: 'No leads found', ru: 'Лиды не найдены' },
  "Filtrlarni o'zgartirib ko'ring.": { en: 'Try changing the filters.', ru: 'Попробуйте изменить фильтры.' },
  'CRM dan hali lid kelmadi — import tugashini kuting.': { en: 'No leads from the CRM yet — wait for the import to finish.', ru: 'Лидов из CRM пока нет — дождитесь окончания импорта.' },
  Lid: { en: 'Lead', ru: 'Лид' },
  Summa: { en: 'Amount', ru: 'Сумма' },
  "Mas'ul": { en: 'Owner', ru: 'Ответственный' },
  SotuvAI: { en: 'SotuvAI', ru: 'SotuvAI' },
  Yangilangan: { en: 'Updated', ru: 'Обновлено' },
  'CRM da ochish': { en: 'Open in CRM', ru: 'Открыть в CRM' },
  'Nomsiz sdelka': { en: 'Untitled deal', ru: 'Сделка без названия' },
  'Menejer kartochkasida CRM ID kiritilmagan': { en: 'CRM ID is not set on the manager card', ru: 'В карточке менеджера не указан CRM ID' },
  "SotuvAI ga bog'lanmagan": { en: 'Not linked to SotuvAI', ru: 'Не связан с SotuvAI' },
  'Oxirgi tahlil': { en: 'Latest analysis', ru: 'Последний анализ' },
  "{n} ta qo'ng'iroq": { en: '{n} calls', ru: 'Звонков: {n}' },
  "Qo'ng'iroq yo'q": { en: 'No calls', ru: 'Нет звонков' },
  "Lidlarni yuklab bo'lmadi": { en: "Couldn't load leads", ru: 'Не удалось загрузить лиды' },
  "Yana ko'rsatish ({n})": { en: 'Show more ({n})', ru: 'Показать ещё ({n})' },

  // ─── Super admin: CRM integratsiyasi ───
  'CRM integratsiyasi': { en: 'CRM integration', ru: 'Интеграция CRM' },
  'amoCRM — bir tugmada ulash': { en: 'amoCRM — one-click connection', ru: 'amoCRM — подключение в одну кнопку' },
  'Platformadagi bitta integratsiya — barcha mijozlar shu orqali ulanadi': {
    en: 'One platform-wide integration — all clients connect through it',
    ru: 'Одна интеграция на платформу — через неё подключаются все клиенты',
  },
  sozlangan: { en: 'configured', ru: 'настроено' },
  sozlanmagan: { en: 'not configured', ru: 'не настроено' },
  'Qanday sozlanadi?': { en: 'How to set it up?', ru: 'Как настроить?' },
  'O‘z amoCRM hisobingizda amoМаркет → «⋯» → «Создать интеграцию» → «Внешняя интеграция».': {
    en: 'In your own amoCRM account: amoМаркет → «⋯» → «Создать интеграцию» → «Внешняя интеграция».',
    ru: 'В своём аккаунте amoCRM: amoМаркет → «⋯» → «Создать интеграцию» → «Внешняя интеграция».',
  },
  '«Ссылка для перенаправления» ga pastdagi manzilni aynan nusxalab qo‘ying.': {
    en: 'Paste the address below exactly into «Ссылка для перенаправления».',
    ru: 'Вставьте адрес ниже в «Ссылка для перенаправления» без изменений.',
  },
  '«Предоставить доступ: Все» ni belgilang, nom bering (masalan «SotuvAI») va saqlang.': {
    en: 'Tick «Предоставить доступ: Все», give it a name (e.g. «SotuvAI») and save.',
    ru: 'Отметьте «Предоставить доступ: Все», задайте название (например, «SotuvAI») и сохраните.',
  },
  '«Ключи и доступы» bo‘limidagi «ID интеграции» va «Секретный ключ» ni shu yerga kiriting.': {
    en: 'Enter the «ID интеграции» and «Секретный ключ» from the «Ключи и доступы» tab here.',
    ru: 'Введите сюда «ID интеграции» и «Секретный ключ» из вкладки «Ключи и доступы».',
  },
  'Bir nechta mijoz hisobi ulanishi uchun amoCRM redirect manzili HTTPS (SSL) bo‘lishini talab qiladi — domen ulangach, manzil o‘zi yangilanadi.': {
    en: 'To connect several client accounts, amoCRM requires an HTTPS (SSL) redirect address — it updates automatically once a domain is connected.',
    ru: 'Для подключения нескольких аккаунтов amoCRM требует HTTPS (SSL) адрес перенаправления — он обновится сам после подключения домена.',
  },
  'Ссылка для перенаправления (redirect URI)': { en: 'Redirect URI (Ссылка для перенаправления)', ru: 'Ссылка для перенаправления (redirect URI)' },
  'Manzil HTTPS emas — hozircha faqat bitta (o‘z) amoCRM hisobingizni ulash mumkin.': {
    en: 'The address is not HTTPS — for now only one (your own) amoCRM account can be connected.',
    ru: 'Адрес не HTTPS — пока можно подключить только один (свой) аккаунт amoCRM.',
  },
  'ID интеграции (client_id)': { en: 'Integration ID (client_id)', ru: 'ID интеграции (client_id)' },
  'Секретный ключ (client_secret)': { en: 'Secret key (client_secret)', ru: 'Секретный ключ (client_secret)' },
  Nusxalash: { en: 'Copy', ru: 'Копировать' },
  "Bir tugmada ulash o'chirilsinmi? Allaqachon ulangan mijozlarning tokeni yangilanmay qoladi.": {
    en: 'Turn off one-click connection? Tokens of already connected clients will stop renewing.',
    ru: 'Отключить подключение в одну кнопку? Токены уже подключённых клиентов перестанут обновляться.',
  },
  "O'chirib bo'lmadi": { en: "Couldn't delete", ru: 'Не удалось удалить' },

  // ─── Server xabarlari: OAuth va lidlar ───
  'Secret key ni kiriting': { en: 'Enter the secret key', ru: 'Введите секретный ключ' },
  'Platformada amoCRM integratsiyasi sozlanmagan — administratorga murojaat qiling': {
    en: 'amoCRM integration is not configured on the platform — contact the administrator',
    ru: 'Интеграция amoCRM не настроена на платформе — обратитесь к администратору',
  },
  'Bir tugmada ulash hali sozlanmagan — platforma administratori amoCRM integratsiyasini kiritishi kerak': {
    en: 'One-click connection is not set up yet — the platform administrator needs to add the amoCRM integration',
    ru: 'Подключение в одну кнопку ещё не настроено — администратор платформы должен добавить интеграцию amoCRM',
  },
  "Lidlarni ko'rish uchun ruxsatingiz yo'q": { en: "You don't have permission to view leads", ru: 'У вас нет доступа к лидам' },
  'amoCRM ruxsat kodini qabul qilmadi — «amoCRM bilan ulash» ni qaytadan bosing': {
    en: 'amoCRM rejected the authorization code — click «Connect with amoCRM» again',
    ru: 'amoCRM не приняла код авторизации — нажмите «Подключить через amoCRM» ещё раз',
  },
  "amoCRM ruxsati bekor qilingan yoki muddati o'tgan — amoCRM ni qayta ulang": {
    en: 'amoCRM access was revoked or has expired — reconnect amoCRM',
    ru: 'Доступ amoCRM отозван или истёк — переподключите amoCRM',
  },
  "amoCRM token javobini o'qib bo'lmadi": { en: "Couldn't read the amoCRM token response", ru: 'Не удалось прочитать ответ amoCRM с токеном' },
  'amoCRM ulanmagan — qayta ulang': { en: 'amoCRM is not connected — reconnect', ru: 'amoCRM не подключена — подключите заново' },
  "amoCRM sdelkalar ro'yxatini o'qib bo'lmadi": { en: "Couldn't read the amoCRM deal list", ru: 'Не удалось прочитать список сделок amoCRM' },
  "Bitrix24 sdelkalar ro'yxatini o'qib bo'lmadi": { en: "Couldn't read the Bitrix24 deal list", ru: 'Не удалось прочитать список сделок Bitrix24' },
};

export default CRM;
