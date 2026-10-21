import type { Lugat } from './index';

/** CRM sahifasi (`pages/Crm.tsx`) va amoCRM server xabarlari. */
const CRM: Lugat = {
  CRM: { en: 'CRM', ru: 'CRM' },
  "CRM tizimingizni ulang — SotuvAI sdelkalar, voronkalar va menejerlarni ko'radi.": {
    en: 'Connect your CRM — SotuvAI will see your deals, pipelines and managers.',
    ru: 'Подключите CRM — SotuvAI увидит сделки, воронки и менеджеров.',
  },
  "Sdelkalar, kontaktlar va qo'ng'iroqlar": { en: 'Deals, contacts and calls', ru: 'Сделки, контакты и звонки' },
  'Tez orada': { en: 'Coming soon', ru: 'Скоро' },
  "Bitrix24 bilan to'g'ridan-to'g'ri ulanish keyingi bosqichda qo'shiladi.": {
    en: 'A direct Bitrix24 connection will be added in the next stage.',
    ru: 'Прямое подключение Bitrix24 появится на следующем этапе.',
  },
  'Boshqa CRM': { en: 'Other CRM', ru: 'Другая CRM' },
  'Istalgan CRM ga vazifalarni imzolangan webhook orqali yuborish mumkin: {havola}.': {
    en: 'Tasks can be sent to any CRM via a signed webhook: {havola}.',
    ru: 'Задачи можно отправлять в любую CRM через подписанный webhook: {havola}.',
  },
  'Sozlamalar → Vazifalarni CRM ga yuborish': {
    en: 'Settings → Send tasks to CRM',
    ru: 'Настройки → Отправка задач в CRM',
  },

  // ─── Holat ───
  ulangan: { en: 'connected', ru: 'подключено' },
  ulanmagan: { en: 'not connected', ru: 'не подключено' },
  xato: { en: 'error', ru: 'ошибка' },
  Hisob: { en: 'Account', ru: 'Аккаунт' },
  Manzil: { en: 'Address', ru: 'Адрес' },
  'Oxirgi tekshiruv': { en: 'Last check', ru: 'Последняя проверка' },
  '{nom} hisobi ulandi': { en: '{nom} account connected', ru: 'Аккаунт {nom} подключён' },
  'Ulanish ishlayapti': { en: 'The connection works', ru: 'Подключение работает' },
  'Ulanishda xato': { en: 'Connection error', ru: 'Ошибка подключения' },
  'Yangi token kiriting yoki ulanishni qayta tekshiring.': {
    en: 'Enter a new token or check the connection again.',
    ru: 'Введите новый токен или проверьте подключение ещё раз.',
  },
  'Token muddati tugagan — amoCRM da yangisini yarating.': {
    en: 'The token has expired — create a new one in amoCRM.',
    ru: 'Срок действия токена истёк — создайте новый в amoCRM.',
  },
  'Token {n} kundan keyin tugaydi — oldindan yangisini yarating.': {
    en: 'The token expires in {n} days — create a new one in advance.',
    ru: 'Токен истекает через {n} дн. — создайте новый заранее.',
  },

  // ─── Tugmalar ───
  'Ulanishni tekshirish': { en: 'Check connection', ru: 'Проверить подключение' },
  'Tokenni almashtirish': { en: 'Replace token', ru: 'Заменить токен' },
  Uzish: { en: 'Disconnect', ru: 'Отключить' },
  'Uzilmoqda…': { en: 'Disconnecting…', ru: 'Отключение…' },
  Ulash: { en: 'Connect', ru: 'Подключить' },
  "Uzib bo'lmadi": { en: "Couldn't disconnect", ru: 'Не удалось отключить' },
  "amoCRM uzilsinmi? Token o'chiriladi, amoCRM dagi ma'lumotlarga tegilmaydi.": {
    en: 'Disconnect amoCRM? The token will be deleted; data in amoCRM stays untouched.',
    ru: 'Отключить amoCRM? Токен будет удалён, данные в amoCRM не затрагиваются.',
  },

  // ─── Ulash formasi ───
  "amoCRM hisobingizni uzoq muddatli token bilan ulang. Token shifrlangan holda saqlanadi va keyin hech qachon to'liq ko'rsatilmaydi.": {
    en: 'Connect your amoCRM account with a long-lived token. The token is stored encrypted and is never shown in full again.',
    ru: 'Подключите аккаунт amoCRM с помощью долгосрочного токена. Токен хранится в зашифрованном виде и больше никогда не показывается полностью.',
  },
  'Tokenni qayerdan olaman?': { en: 'Where do I get the token?', ru: 'Где взять токен?' },
  'amoCRM da {yol} oching.': { en: 'In amoCRM, open {yol}.', ru: 'В amoCRM откройте {yol}.' },
  'Integratsiyaga nom bering (masalan «SotuvAI») va hisob maʼlumotlariga kirish ruxsatini belgilang.': {
    en: 'Name the integration (e.g. “SotuvAI”) and grant access to account data.',
    ru: 'Назовите интеграцию (например, «SotuvAI») и отметьте доступ к данным аккаунта.',
  },
  'Saqlang, so‘ng {tab} bo‘limida {token} yarating.': {
    en: 'Save it, then create a {token} in the {tab} tab.',
    ru: 'Сохраните, затем во вкладке {tab} создайте {token}.',
  },
  'Muddatini tanlang (uzoqroq — qulayroq), tokenni nusxalab shu yerga qo‘ying.': {
    en: 'Choose the expiry (longer is more convenient), copy the token and paste it here.',
    ru: 'Выберите срок действия (чем дольше — тем удобнее), скопируйте токен и вставьте сюда.',
  },
  'Tokenni hech kimga, jumladan chatga yubormang — faqat shu maydonga kiriting.': {
    en: 'Never send the token to anyone, including in a chat — only enter it in this field.',
    ru: 'Никому не отправляйте токен, в том числе в чат, — вводите его только в это поле.',
  },
  'Hisob manzili': { en: 'Account address', ru: 'Адрес аккаунта' },
  'Brauzerdagi amoCRM manzilini nusxalab qo‘yishingiz mumkin.': {
    en: 'You can paste the amoCRM address straight from your browser.',
    ru: 'Можно вставить адрес amoCRM прямо из браузера.',
  },
  'Uzoq muddatli token': { en: 'Long-lived token', ru: 'Долгосрочный токен' },

  // ─── Hisob tuzilishi ───
  'Hisob tuzilishi': { en: 'Account structure', ru: 'Структура аккаунта' },
  "amoCRM dan jonli o'qildi. SotuvAI hozircha amoCRM ga hech narsa yozmaydi.": {
    en: 'Read live from amoCRM. SotuvAI does not write anything to amoCRM yet.',
    ru: 'Прочитано из amoCRM в реальном времени. Пока SotuvAI ничего не записывает в amoCRM.',
  },
  "amoCRM ma'lumotini olib bo'lmadi": { en: "Couldn't load amoCRM data", ru: 'Не удалось получить данные amoCRM' },
  'Voronka##soni': { en: 'Pipelines', ru: 'Воронки' },
  'Bosqich##soni': { en: 'Stages', ru: 'Этапы' },
  'Foydalanuvchi##soni': { en: 'Users', ru: 'Пользователи' },
  'Sdelka maydoni': { en: 'Deal fields', ru: 'Поля сделки' },
  asosiy: { en: 'main', ru: 'основная' },
  '{nom} bosqichlari': { en: '{nom} stages', ru: 'Этапы воронки {nom}' },
  Foydalanuvchilar: { en: 'Users', ru: 'Пользователи' },
  admin: { en: 'admin', ru: 'админ' },
  nofaol: { en: 'inactive', ru: 'неактивен' },

  // ─── Server xabarlari (backend/src/integrations/amocrm.ts, routes/amocrm.ts) ───
  "Manzil noto'g'ri. Masalan: kompaniya.amocrm.ru": {
    en: 'Invalid address. Example: company.amocrm.ru',
    ru: 'Неверный адрес. Например: company.amocrm.ru',
  },
  'Uzoq muddatli tokenni kiriting': { en: 'Enter the long-lived token', ru: 'Введите долгосрочный токен' },
  'Token muddati tugagan — amoCRM da yangisini yarating': {
    en: 'The token has expired — create a new one in amoCRM',
    ru: 'Срок действия токена истёк — создайте новый в amoCRM',
  },
  'amoCRM ulanmagan': { en: 'amoCRM is not connected', ru: 'amoCRM не подключена' },
  "Token noto'g'ri, muddati tugagan yoki amoCRM da bekor qilingan": {
    en: 'The token is invalid, expired or revoked in amoCRM',
    ru: 'Токен неверный, истёк или отозван в amoCRM',
  },
  "amoCRM hisobi to'lanmagan yoki bloklangan": {
    en: 'The amoCRM account is unpaid or blocked',
    ru: 'Аккаунт amoCRM не оплачен или заблокирован',
  },
  "Tokenga bu ma'lumotni o'qishga ruxsat berilmagan": {
    en: 'The token is not allowed to read this data',
    ru: 'У токена нет доступа к этим данным',
  },
  'amoCRM hisobi topilmadi — manzilni tekshiring': {
    en: 'amoCRM account not found — check the address',
    ru: 'Аккаунт amoCRM не найден — проверьте адрес',
  },
  "amoCRM so'rovlar limitiga yetildi — birozdan keyin qayta urinib ko'ring": {
    en: 'amoCRM request limit reached — please try again shortly',
    ru: 'Достигнут лимит запросов amoCRM — повторите чуть позже',
  },
  "amoCRM ga ulanib bo'lmadi — manzil va internetni tekshiring": {
    en: "Couldn't reach amoCRM — check the address and internet connection",
    ru: 'Не удалось подключиться к amoCRM — проверьте адрес и интернет',
  },
  "amoCRM javobini o'qib bo'lmadi": { en: "Couldn't read the amoCRM response", ru: 'Не удалось прочитать ответ amoCRM' },
  "amoCRM hisob ma'lumotini qaytarmadi": {
    en: 'amoCRM did not return account details',
    ru: 'amoCRM не вернула данные аккаунта',
  },
  "amoCRM voronkalar ro'yxatini o'qib bo'lmadi": {
    en: "Couldn't read the amoCRM pipeline list",
    ru: 'Не удалось прочитать список воронок amoCRM',
  },
};

export default CRM;
