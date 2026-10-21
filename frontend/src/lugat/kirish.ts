import type { Lugat } from './index';

/**
 * Kirish oqimi: login (taqdimot sahnasi bilan), parolni tiklash,
 * menejer aktivatsiyasi va parol maydoni.
 */
const KIRISH: Lugat = {
  // ─── Login: forma ───
  'Bosh sahifaga qaytish': { en: 'Back to home', ru: 'Вернуться на главную' },
  'Xush kelibsiz': { en: 'Welcome back', ru: 'Добро пожаловать' },
  'Parolni tiklash': { en: 'Reset password', ru: 'Восстановление пароля' },
  'Davom etish uchun hisobingizga kiring': {
    en: 'Sign in to your account to continue',
    ru: 'Войдите в аккаунт, чтобы продолжить',
  },
  'Email yoki loginingizni kiriting — tiklash havolasini yuboramiz': {
    en: "Enter your email or login — we'll send you a reset link",
    ru: 'Введите email или логин — мы отправим ссылку для восстановления',
  },
  Kirish: { en: 'Sign in', ru: 'Войти' },
  'Tiklash havolasini yuborish': { en: 'Send reset link', ru: 'Отправить ссылку' },
  "Server bilan bog'lanib bo'lmadi": { en: "Couldn't connect to the server", ru: 'Не удалось связаться с сервером' },
  "Agar bunday hisob mavjud bo'lsa va Telegram bog'langan bo'lsa, tiklash havolasi yuborildi. Havola 30 daqiqa amal qiladi.": {
    en: 'If such an account exists and Telegram is linked, a reset link has been sent. The link is valid for 30 minutes.',
    ru: 'Если такой аккаунт существует и к нему привязан Telegram, ссылка для восстановления отправлена. Она действует 30 минут.',
  },
  "Telegram bog'lanmagan bo'lsa — rahbaringizdan tiklash havolasini so'rang.": {
    en: "If Telegram isn't linked, ask your supervisor for a reset link.",
    ru: 'Если Telegram не привязан — попросите ссылку для восстановления у руководителя.',
  },
  'Email yoki login': { en: 'Email or login', ru: 'Email или логин' },
  'siz@kompaniya.uz': { en: 'you@company.com', ru: 'name@company.uz' },
  Parol: { en: 'Password', ru: 'Пароль' },
  'Parolni unutdingizmi?': { en: 'Forgot password?', ru: 'Забыли пароль?' },
  'Kuting…': { en: 'Please wait…', ru: 'Подождите…' },
  'Kirishga qaytish': { en: 'Back to sign in', ru: 'Вернуться ко входу' },

  // ─── Login: chap panel ───
  'Har bir ball ortida —': { en: 'Behind every score —', ru: 'За каждым баллом —' },
  'isbot.': { en: 'proof.', ru: 'доказательство.' },
  "Sotuv bo'limingiz yozishmalarini kompaniyangizning o'z skripti bo'yicha baholaydigan va har bir sotuvchiga kouching beradigan platforma.": {
    en: "A platform that scores your sales team's conversations against your company's own script and coaches every rep.",
    ru: 'Платформа, которая оценивает переписку вашего отдела продаж по собственному скрипту компании и даёт коучинг каждому менеджеру.',
  },

  // ─── Login: taqdimot sahnasi ───
  'Telegram yozishmalari': { en: 'Telegram chats', ru: 'Переписка в Telegram' },
  "Suhbatlar avtomatik yig'iladi va sizning skriptingiz bo'yicha tahlil qilinadi.": {
    en: 'Conversations are collected automatically and analyzed against your script.',
    ru: 'Разговоры собираются автоматически и анализируются по вашему скрипту.',
  },
  'Isbotli baholash': { en: 'Evidence-based scoring', ru: 'Доказательная оценка' },
  'Har bir ball yozishmadagi aniq iqtibos bilan tasdiqlanadi.': {
    en: 'Every score is backed by an exact quote from the chat.',
    ru: 'Каждый балл подтверждается точной цитатой из переписки.',
  },
  "Kouching va o'sish": { en: 'Coaching and growth', ru: 'Коучинг и рост' },
  'Har bir sotuvchi uchun eng zaif joy va aniq tavsiya.': {
    en: "Each rep's weakest spot and a clear recommendation.",
    ru: 'Слабое место и точная рекомендация для каждого менеджера.',
  },
  'Assalomu alaykum! Frontend kursi narxi qancha?': {
    en: 'Hello! How much is the frontend course?',
    ru: 'Здравствуйте! Сколько стоит курс по фронтенду?',
  },
  'Va alaykum assalom! {belgi} — ishga kirish uchunmi?': {
    en: 'Hello! {belgi} — is it to get a job?',
    ru: 'Здравствуйте! {belgi} — для трудоустройства?',
  },
  'Avval maqsadingizni bilsam': { en: 'May I first ask your goal', ru: 'Сначала уточню вашу цель' },
  'Ha, ishga. Lekin narxi qimmat emasmi?': {
    en: "Yes, for a job. But isn't it expensive?",
    ru: 'Да, для работы. Но не дорого ли?',
  },
  'Tushunaman. {belgi} — birinchi dars bepul.': {
    en: 'I understand. {belgi} — and the first lesson is free.',
    ru: 'Понимаю. {belgi} — а первое занятие бесплатно.',
  },
  "Bo'lib to'lash imkoni bor": { en: 'Installments are available', ru: 'Есть рассрочка' },
  Salomlashish: { en: 'Greeting', ru: 'Приветствие' },
  'Ehtiyojni aniqlash': { en: 'Needs discovery', ru: 'Выявление потребности' },
  "E'tirozga javob": { en: 'Objection handling', ru: 'Работа с возражением' },
  'Keyingi qadam': { en: 'Next step', ru: 'Следующий шаг' },
  'Telegram · mijoz': { en: 'Telegram · customer', ru: 'Telegram · клиент' },
  jonli: { en: 'live', ru: 'онлайн' },
  "Skript bo'yicha tahlil": { en: 'Script analysis', ru: 'Анализ по скрипту' },
  'Umumiy ball': { en: 'Overall score', ru: 'Общий балл' },
  '3 ta isbot': { en: '3 pieces of evidence', ru: '3 доказательства' },
  'Kouch tavsiyasi:': { en: 'Coach tip:', ru: 'Совет коуча:' },
  "suhbatni aniq qadam bilan yakunlang — «Ertaga 15:00 da qo'ng'iroq qilsam bo'ladimi?»": {
    en: 'end the conversation with a clear next step — “May I call you tomorrow at 3:00 PM?”',
    ru: 'завершайте разговор чётким шагом — «Можно я позвоню вам завтра в 15:00?»',
  },
  'Taqdimot bosqichlari': { en: 'Presentation steps', ru: 'Этапы презентации' },
  '{raqam}-bosqich: {nom}': { en: 'Step {raqam}: {nom}', ru: 'Этап {raqam}: {nom}' },
  "Qayta ko'rish": { en: 'Replay', ru: 'Смотреть снова' },
  "G'ildirak bilan boshqaring": { en: 'Scroll to control', ru: 'Управляйте колёсиком' },

  // ─── Parol maydoni ───
  'Parolni yashirish': { en: 'Hide password', ru: 'Скрыть пароль' },
  "Parolni ko'rsatish": { en: 'Show password', ru: 'Показать пароль' },

  // ─── Parolni tiklash ───
  "Yangi parol o'rnating": { en: 'Set a new password', ru: 'Задайте новый пароль' },
  "Havola eskirgan bo'lsa, kirish ekranidan yangisini so'rang.": {
    en: 'If the link has expired, request a new one from the sign-in screen.',
    ru: 'Если ссылка устарела, запросите новую на экране входа.',
  },
  'Yangi parol': { en: 'New password', ru: 'Новый пароль' },
  'Kamida 10 belgi. Uzunlik murakkablikdan muhimroq.': {
    en: 'At least 10 characters. Length matters more than complexity.',
    ru: 'Минимум 10 символов. Длина важнее сложности.',
  },
  'Parolni takrorlang': { en: 'Repeat password', ru: 'Повторите пароль' },
  'Parollar mos kelmadi': { en: "Passwords don't match", ru: 'Пароли не совпадают' },
  "Parolni o'rnatish": { en: 'Set password', ru: 'Установить пароль' },
  "Parol o'zgargach barcha qurilmalardagi eski sessiyalar bekor qilinadi.": {
    en: 'Once the password changes, old sessions on all devices are signed out.',
    ru: 'После смены пароля старые сессии на всех устройствах будут завершены.',
  },

  // ─── Menejer aktivatsiyasi ───
  'Hisobni faollashtirish': { en: 'Activate account', ru: 'Активировать аккаунт' },
  "Havola bir marta ishlaydi va 7 kun amal qiladi. Rahbaringizdan yangisini so'rang.": {
    en: 'The link works once and is valid for 7 days. Ask your supervisor for a new one.',
    ru: 'Ссылка одноразовая и действует 7 дней. Попросите новую у руководителя.',
  },
  'Havola tekshirilmoqda…': { en: 'Checking the link…', ru: 'Проверяем ссылку…' },
  "Salom, {ism}! {biznes} jamoasiga kirish uchun parol o'rnating.": {
    en: 'Hi, {ism}! Set a password to join the {biznes} team.',
    ru: 'Здравствуйте, {ism}! Задайте пароль, чтобы войти в команду {biznes}.',
  },
  Login: { en: 'Login', ru: 'Логин' },
  'masalan: aziz.karimov': { en: 'e.g. aziz.karimov', ru: 'например: aziz.karimov' },
  '3–40 belgi: lotin harflari, raqam va . _ -': {
    en: '3–40 characters: Latin letters, digits and . _ -',
    ru: '3–40 символов: латинские буквы, цифры и . _ -',
  },
  'Faollashtirilmoqda…': { en: 'Activating…', ru: 'Активация…' },
  'Keyingi safar shu login va parol bilan kirasiz.': {
    en: "You'll sign in with this login and password next time.",
    ru: 'В следующий раз входите с этим логином и паролем.',
  },

  // ─── Kirish xatolari (server javobi → tushunarli matn) ───
  "Login yoki parol noto'g'ri": { en: 'Incorrect login or password', ru: 'Неверный логин или пароль' },
  "Login yoki parol noto'g'ri. Parolni unutgan bo'lsangiz, administratorga murojaat qiling.": {
    en: 'Incorrect login or password. If you forgot your password, contact the administrator.',
    ru: 'Неверный логин или пароль. Если вы забыли пароль, обратитесь к администратору.',
  },
  "Juda ko'p urinish. {n} daqiqadan keyin qayta urinib ko'ring.": {
    en: 'Too many attempts. Try again in {n} min.',
    ru: 'Слишком много попыток. Повторите через {n} мин.',
  },
  "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring.": {
    en: 'Too many attempts. Please try again a bit later.',
    ru: 'Слишком много попыток. Повторите чуть позже.',
  },
  "Serverda xatolik yuz berdi. Birozdan keyin qayta urinib ko'ring.": {
    en: 'A server error occurred. Please try again a bit later.',
    ru: 'Произошла ошибка сервера. Повторите чуть позже.',
  },
};

export default KIRISH;
