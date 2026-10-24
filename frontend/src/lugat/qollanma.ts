import type { Lugat } from './index';

/** Qo'llanma: video darslar sahifasi, pleyer va video qo'shish oynasi. */
const QOLLANMA: Lugat = {
  // ─── Menyu va sahifa ───
  "Qo'llanma": { en: 'Guide', ru: 'Обучение' },
  "Platformadan foydalanish bo'yicha video darslar — qadamma-qadam": {
    en: 'Step-by-step video lessons on using the platform',
    ru: 'Пошаговые видеоуроки по работе с платформой',
  },
  "Video qo'shish": { en: 'Add video', ru: 'Добавить видео' },
  Yuklanmadi: { en: "Couldn't load", ru: 'Не удалось загрузить' },
  "Hali qo'llanma videolari yo'q": { en: 'No guide videos yet', ru: 'Видеоуроков пока нет' },
  "YouTube, Vimeo, Google Drive havolasini qo'ying yoki videoni kompyuterdan yuklang.": {
    en: 'Paste a YouTube, Vimeo or Google Drive link, or upload a video from your computer.',
    ru: 'Вставьте ссылку YouTube, Vimeo или Google Drive либо загрузите видео с компьютера.',
  },
  "Tez orada bu yerda platformadan foydalanish bo'yicha video darslar paydo bo'ladi.": {
    en: 'Video lessons on using the platform will appear here soon.',
    ru: 'Скоро здесь появятся видеоуроки по работе с платформой.',
  },
  "Birinchi videoni qo'shish": { en: 'Add the first video', ru: 'Добавить первое видео' },
  'Darslardan qidirish…': { en: 'Search lessons…', ru: 'Поиск по урокам…' },
  "Bo'limlar": { en: 'Sections', ru: 'Разделы' },
  'Filtrni tozalash': { en: 'Clear filter', ru: 'Сбросить фильтр' },

  // ─── Dars ───
  'Tanlangan dars': { en: 'Selected lesson', ru: 'Выбранный урок' },
  '{n}-dars': { en: 'Lesson {n}', ru: 'Урок {n}' },
  Qoralama: { en: 'Draft', ru: 'Черновик' },
  "Ko'rildi": { en: 'Watched', ru: 'Просмотрено' },
  "Ko'rildi deb belgilash": { en: 'Mark as watched', ru: 'Отметить как просмотренное' },
  'Manbada ochish': { en: 'Open source', ru: 'Открыть источник' },
  'Keyingi dars': { en: 'Next lesson', ru: 'Следующий урок' },
  Keyingisi: { en: 'Next', ru: 'Дальше' },
  Darslar: { en: 'Lessons', ru: 'Уроки' },
  '{n} ta video': { en: '{n} videos', ru: 'Видео: {n}' },
  "Ko'rilgan darslar": { en: 'Watched lessons', ru: 'Просмотренные уроки' },
  Tayyorlanmoqda: { en: 'Processing', ru: 'Обработка' },
  'Fayl yuklanmagan': { en: 'File not uploaded', ru: 'Файл не загружен' },
  "O'chirilsinmi?": { en: 'Delete?', ru: 'Удалить?' },
  "Hammaga ko'rsatish": { en: 'Show to everyone', ru: 'Показать всем' },
  'Video fayl': { en: 'Video file', ru: 'Видеофайл' },
  'Tashqi sayt': { en: 'External site', ru: 'Внешний сайт' },

  // ─── Pleyer ───
  'Fayl hali yuklanmagan': { en: 'The file has not been uploaded yet', ru: 'Файл ещё не загружен' },
  'Video tayyorlanmoqda…': { en: 'Preparing the video…', ru: 'Видео обрабатывается…' },
  'Tahrirlash orqali video faylni yuklang.': {
    en: 'Upload the video file via Edit.',
    ru: 'Загрузите видеофайл через «Редактировать».',
  },
  "Server videoni barcha qurilmalarda ochiladigan formatga o'tkazmoqda. Bu bir necha daqiqa olishi mumkin.": {
    en: 'The server is converting the video to a format that plays on every device. This may take a few minutes.',
    ru: 'Сервер конвертирует видео в формат, который открывается на всех устройствах. Это может занять несколько минут.',
  },
  'Video tayyorlanmadi': { en: "The video couldn't be processed", ru: 'Не удалось обработать видео' },
  "Faylni qayta yuklab ko'ring.": { en: 'Try uploading the file again.', ru: 'Попробуйте загрузить файл снова.' },
  "To'xtagan joydan davom etmoqda · Boshidan ko'rish": {
    en: 'Resuming where you left off · Start over',
    ru: 'Продолжаем с места остановки · Смотреть сначала',
  },
  "Barcha darslarni ko'rib chiqdingiz": { en: "You've watched all the lessons", ru: 'Вы просмотрели все уроки' },
  'Bu video boshqa saytda joylashgan': { en: 'This video is hosted on another site', ru: 'Это видео размещено на другом сайте' },
  "Sayt videoni bu yerda ko'rsatishga ruxsat bermaydi — uni yangi oynada oching.": {
    en: "The site doesn't allow playing it here — open it in a new tab.",
    ru: 'Сайт не разрешает показывать видео здесь — откройте его в новой вкладке.',
  },

  // ─── Qo'shish / tahrirlash oynasi ───
  'Videoni tahrirlash': { en: 'Edit video', ru: 'Редактировать видео' },
  'Video manbasi': { en: 'Video source', ru: 'Источник видео' },
  'Fayl yuklash': { en: 'Upload file', ru: 'Загрузить файл' },
  'Video havolasi': { en: 'Video link', ru: 'Ссылка на видео' },
  'va boshqalar': { en: 'and more', ru: 'и другие' },
  "Havola noto'g'ri — video manzilini to'liq qo'ying": {
    en: 'Invalid link — paste the full video address',
    ru: 'Неверная ссылка — вставьте полный адрес видео',
  },
  "Bu sayt ichki pleyerni qo'llamaydi — video yangi oynada ochiladi": {
    en: "This site doesn't support an embedded player — the video opens in a new tab",
    ru: 'Сайт не поддерживает встроенный плеер — видео откроется в новой вкладке',
  },
  "Video fayl — platformaning o'z pleyerida ochiladi": {
    en: "Video file — plays in the platform's own player",
    ru: 'Видеофайл — откроется во встроенном плеере платформы',
  },
  "Platforma ichida o'ynaydi": { en: 'Plays inside the platform', ru: 'Воспроизводится внутри платформы' },
  'Faylni shu yerga tashlang yoki tanlang': { en: 'Drop the file here or browse', ru: 'Перетащите файл сюда или выберите' },
  'MP4, MOV, MKV, WEBM, AVI — {hajm} gacha': { en: 'MP4, MOV, MKV, WEBM, AVI — up to {hajm}', ru: 'MP4, MOV, MKV, WEBM, AVI — до {hajm}' },
  'Fayl juda katta — {hajm} dan oshmasin': { en: 'The file is too large — max {hajm}', ru: 'Файл слишком большой — не более {hajm}' },
  'Video fayl tanlang': { en: 'Choose a video file', ru: 'Выберите видеофайл' },
  'Joriy fayl: {nom}. Yangi fayl tanlasangiz, u almashtiriladi.': {
    en: 'Current file: {nom}. Choosing a new file will replace it.',
    ru: 'Текущий файл: {nom}. Новый файл заменит его.',
  },
  "Server videoni telefon, Safari va boshqa barcha brauzerlarda ochiladigan formatga o'zi o'tkazadi.": {
    en: 'The server automatically converts the video to a format that plays on phones, Safari and every other browser.',
    ru: 'Сервер сам конвертирует видео в формат, который открывается на телефонах, в Safari и любых других браузерах.',
  },
  Sarlavha: { en: 'Title', ru: 'Название' },
  "Masalan: Qo'ng'iroqlar bo'limi bilan ishlash": {
    en: 'e.g. Working with the Calls section',
    ru: 'Например: Работа с разделом «Звонки»',
  },
  'Masalan: Boshlash': { en: 'e.g. Getting started', ru: 'Например: Начало работы' },
  "Hammaga ko'rinadi": { en: 'Visible to everyone', ru: 'Видно всем' },
  "Qoralama — faqat siz ko'rasiz": { en: 'Draft — only you can see it', ru: 'Черновик — видите только вы' },
  "Bu darsda nimani o'rganadi — qisqacha": {
    en: 'What this lesson teaches — briefly',
    ru: 'Чему учит этот урок — кратко',
  },
  'Yuklanmoqda… {foiz}%': { en: 'Uploading… {foiz}%', ru: 'Загрузка… {foiz}%' },
  'Server qabul qilmoqda…': { en: 'Server is receiving…', ru: 'Сервер принимает…' },
  'Yuklashni bekor qilish': { en: 'Cancel upload', ru: 'Отменить загрузку' },
};

export default QOLLANMA;
