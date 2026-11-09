import type { Lugat } from './index';

/**
 * CRM Simulyator: ssenariy kartalari, "Boshlashdan oldin" oynasi,
 * qo'ng'iroq ekrani, natija sahifasi va server xatolari.
 */
const SIMULYATOR: Lugat = {
  // ─── Sahifa ───
  Simulyator: { en: 'Simulator', ru: 'Симулятор' },
  "AI mijoz bilan qo'ng'iroqni mashq qiling — haqiqiy mijozdan oldin xato qilib oling.": {
    en: 'Practise calls with an AI client — make your mistakes before the real client does.',
    ru: 'Тренируйте звонки с AI-клиентом — ошибайтесь до настоящего клиента.',
  },
  'Yangi yaratish': { en: 'Create new', ru: 'Создать' },
  Ssenariylar: { en: 'Scenarios', ru: 'Сценарии' },
  "Maqsad yoki vaziyat bo'yicha qidirish": { en: 'Search by goal or situation', ru: 'Поиск по цели или ситуации' },
  "Ssenariylar yo'q": { en: 'No scenarios', ru: 'Сценариев нет' },
  '{nom} — ssenariy tafsilotlari': { en: '{nom} — scenario details', ru: '{nom} — детали сценария' },
  'Ssenariy tafsilotlari': { en: 'Scenario details', ru: 'Детали сценария' },
  Mashqlaringiz: { en: 'Your practice', ru: 'Ваши тренировки' },
  "mashq qo'ng'iroqlari": { en: 'practice calls', ru: 'тренировочных звонков' },
  daq: { en: 'min', ru: 'мин' },
  'suhbat vaqti': { en: 'talk time', ru: 'время разговора' },
  "So'nggi mashqlar": { en: 'Recent practice', ru: 'Последние тренировки' },
  'Hali mashq qilmadingiz. Ssenariyni tanlab, «Boshlash»ni bosing.': {
    en: "You haven't practised yet. Pick a scenario and press «Start».",
    ru: 'Вы ещё не тренировались. Выберите сценарий и нажмите «Начать».',
  },
  'Juda qisqa': { en: 'Too short', ru: 'Слишком коротко' },
  Erishildi: { en: 'Achieved', ru: 'Достигнуто' },
  Erishilmadi: { en: 'Not achieved', ru: 'Не достигнуто' },
  "Mashq tarixingizni faqat siz ko'rasiz.": { en: 'Only you can see your practice history.', ru: 'Историю тренировок видите только вы.' },

  // ─── Tafsilot va forma ───
  "Ha, o'chirish": { en: 'Yes, delete', ru: 'Да, удалить' },
  'Mijoz kayfiyati': { en: 'Client mood', ru: 'Настроение клиента' },
  Vaziyat: { en: 'Situation', ru: 'Ситуация' },
  "Qo'ng'iroq maqsadi": { en: 'Call goal', ru: 'Цель звонка' },
  Erkak: { en: 'Male', ru: 'Мужчина' },
  Ayol: { en: 'Female', ru: 'Женщина' },
  'Mijoz aytishi mumkin': { en: 'The client may say', ru: 'Клиент может сказать' },
  'Mijoz xulqi': { en: 'Client behaviour', ru: 'Поведение клиента' },
  "menejerlarga ko'rinmaydi": { en: 'hidden from managers', ru: 'не видно менеджерам' },
  'Ssenariyni tahrirlash': { en: 'Edit scenario', ru: 'Редактировать сценарий' },
  'Yangi ssenariy': { en: 'New scenario', ru: 'Новый сценарий' },
  'Mijoz jinsi': { en: 'Client gender', ru: 'Пол клиента' },
  'Ssenariy nomi': { en: 'Scenario name', ru: 'Название сценария' },
  'Mijoz xulqi (AI uchun)': { en: 'Client behaviour (for AI)', ru: 'Поведение клиента (для AI)' },
  "Masalan: Narxga arzishini ko'rsating": { en: "For example: Show it's worth the price", ru: 'Например: Покажите, что цена оправдана' },
  "Kartada sarlavha bo'lib chiqadi — menejer erishishi kerak bo'lgan natija.": {
    en: 'Shown as the card title — the result the manager must achieve.',
    ru: 'Заголовок карточки — результат, которого должен добиться менеджер.',
  },
  'Masalan: Dilnoza uyi yaqinida arzonroq taklif topgan.': {
    en: 'For example: Dilnoza found a cheaper offer near her home.',
    ru: 'Например: Дилноза нашла предложение дешевле рядом с домом.',
  },
  "Kartada ko'rinadi — menejer qo'ng'iroqdan oldin biladigan narsa.": {
    en: 'Shown on the card — what the manager knows before the call.',
    ru: 'Видно на карточке — то, что менеджер знает до звонка.',
  },
  "Masalan: Taklifingiz mijoz uchun nega qimmatliroq ekanini ko'rsatish.": {
    en: 'For example: Show why your offer is more valuable for the client.',
    ru: 'Например: Показать, почему ваше предложение ценнее для клиента.',
  },
  'Natijada «maqsadga erishildimi» shunga qarab baholanadi.': {
    en: 'The result «goal achieved or not» is judged against this.',
    ru: 'По этому оценивается, «достигнута ли цель».',
  },
  'Masalan: Dilnoza': { en: 'For example: Dilnoza', ru: 'Например: Дилноза' },
  "Masalan: Narx bo'yicha shubhasi bor, lekin buni o'zi aytmaydi. Bosim o'tkazilsa yopilib qoladi; ochiq savol berilsa — haqiqiy sababni aytadi.": {
    en: "For example: Has doubts about the price but won't say so. Shuts down under pressure; tells the real reason when asked an open question.",
    ru: 'Например: Сомневается в цене, но сам не говорит. Под давлением закрывается; на открытый вопрос называет настоящую причину.',
  },
  "AI mijoz o'zini shunday tutadi. Menejerlarga ko'rinmaydi.": {
    en: 'The AI client behaves like this. Hidden from managers.',
    ru: 'AI-клиент ведёт себя так. Менеджерам не видно.',
  },
  "Har birini yangi qatordan:\nQimmat ekan\nO'ylab ko'raman": {
    en: "Each on a new line:\nIt's expensive\nI'll think about it",
    ru: 'Каждое с новой строки:\nДорого\nЯ подумаю',
  },
  "Har qatorda bitta e'tiroz — mijoz suhbatda shulardan foydalanadi.": {
    en: 'One objection per line — the client uses them during the call.',
    ru: 'По одному возражению в строке — клиент использует их в разговоре.',
  },

  // ─── Boshlashdan oldin ───
  "Qo'ng'iroqni boshlab bo'lmadi": { en: "Couldn't start the call", ru: 'Не удалось начать звонок' },
  'Boshlashdan oldin': { en: 'Before you start', ru: 'Перед началом' },
  'Hozir emas': { en: 'Not now', ru: 'Не сейчас' },
  'Ulanmoqda…': { en: 'Connecting…', ru: 'Соединение…' },
  "Qo'ng'iroqni boshlash · {n} daqiqa": { en: 'Start call · {n} minutes', ru: 'Начать звонок · {n} мин' },
  Maqsad: { en: 'Goal', ru: 'Цель' },
  '{n} daqiqa, pauzasiz': { en: '{n} minutes, no pauses', ru: '{n} минут, без пауз' },
  "Vaqt tugaganda qo'ng'iroq o'zi yakunlanadi": { en: 'The call ends automatically when time is up', ru: 'Звонок завершится сам, когда время выйдет' },
  '{v} — mijoz yakunlay boshlaydi': { en: '{v} — the client starts wrapping up', ru: '{v} — клиент начинает завершать' },
  'Yozma rejim': { en: 'Text mode', ru: 'Текстовый режим' },
  'Ovozli rejim AI ovoz provayderi ulangach yoqiladi. Hozircha mijoz bilan yozib gaplashasiz — u xuddi telefondagidek javob beradi.': {
    en: 'Voice mode turns on once an AI voice provider is connected. For now you type, and the client answers just like on the phone.',
    ru: 'Голосовой режим включится после подключения голосового AI-провайдера. Пока вы пишете, а клиент отвечает как по телефону.',
  },
  'AI provayder ulanmagan — administrator ulagach mashq qilish mumkin': {
    en: 'The AI provider is not connected — practice will be available once an administrator connects it',
    ru: 'AI-провайдер не подключён — тренироваться можно после подключения администратором',
  },
  'Mikrofon tekshiruvi': { en: 'Microphone check', ru: 'Проверка микрофона' },
  'Mikrofonni tekshirish': { en: 'Check microphone', ru: 'Проверить микрофон' },
  'Ovoz darajasi': { en: 'Sound level', ru: 'Уровень звука' },
  "Gapirib ko'ring — chiziq harakatlansa, mikrofon ishlayapti.": {
    en: 'Say something — if the bar moves, the microphone works.',
    ru: 'Скажите что-нибудь — если полоса двигается, микрофон работает.',
  },
  Mikrofon: { en: 'Microphone', ru: 'Микрофон' },
  'Mikrofon {n}': { en: 'Microphone {n}', ru: 'Микрофон {n}' },
  'Mikrofonga ruxsat berilmadi. Brauzer manzil satridagi qulf belgisidan ruxsat bering.': {
    en: 'Microphone access was denied. Allow it via the lock icon in the address bar.',
    ru: 'Доступ к микрофону запрещён. Разрешите его через значок замка в адресной строке.',
  },
  'Mikrofon topilmadi.': { en: 'No microphone found.', ru: 'Микрофон не найден.' },

  // ─── Qo'ng'iroq ekrani ───
  'Mijoz javob bera olmadi — gapingizni qayta yuboring': {
    en: "The client couldn't answer — send your message again",
    ru: 'Клиент не смог ответить — отправьте реплику ещё раз',
  },
  "Mashq qo'ng'irog'i: {ism}": { en: 'Practice call: {ism}', ru: 'Тренировочный звонок: {ism}' },
  "{ism} — AI mijoz, haqiqiy odam emas. Mashq tarixingizni faqat siz ko'rasiz.": {
    en: '{ism} is an AI client, not a real person. Only you can see your practice history.',
    ru: '{ism} — AI-клиент, не настоящий человек. Историю тренировок видите только вы.',
  },
  "Qo'ng'iroq qilinmoqda… · Ulanmoqda": { en: 'Calling… · Connecting', ru: 'Звоним… · Соединение' },
  "Qo'ng'iroq tugadi": { en: 'Call ended', ru: 'Звонок завершён' },
  "Mijoz qo'ng'iroqni tugatdi": { en: 'The client ended the call', ru: 'Клиент завершил звонок' },
  '{ism} javob bermoqda…': { en: '{ism} is answering…', ru: '{ism} отвечает…' },
  'Mijoz suhbatni yakunlamoqda': { en: 'The client is wrapping up', ru: 'Клиент завершает разговор' },
  'Yakunlash: {v}': { en: 'Wrap-up: {v}', ru: 'Завершение: {v}' },
  '{v} qoldi': { en: '{v} left', ru: 'Осталось {v}' },
  'Ovozli rejimda ishlaydi': { en: 'Works in voice mode', ru: 'Работает в голосовом режиме' },
  "Mikrofonni o'chirish": { en: 'Mute microphone', ru: 'Выключить микрофон' },
  'Yakunlanmoqda…': { en: 'Ending…', ru: 'Завершение…' },
  Tugatish: { en: 'End call', ru: 'Завершить' },
  'Jonli matn': { en: 'Live transcript', ru: 'Живая расшифровка' },
  "Faqat qo'ng'iroqdan keyingi tahlil uchun": { en: 'Only for the post-call analysis', ru: 'Только для анализа после звонка' },
  '{ism}ga javobingizni yozing…': { en: 'Type your reply to {ism}…', ru: 'Напишите ответ для {ism}…' },
  Javobingiz: { en: 'Your reply', ru: 'Ваш ответ' },
  'Enter — yuborish, Shift + Enter — yangi qator': { en: 'Enter — send, Shift + Enter — new line', ru: 'Enter — отправить, Shift + Enter — новая строка' },

  // ─── Natija ───
  "Qayta tahlil qilib bo'lmadi": { en: "Couldn't re-analyse", ru: 'Не удалось проанализировать заново' },
  'Simulyatorga qaytish': { en: 'Back to the simulator', ru: 'Вернуться в симулятор' },
  "Siz qo'ng'iroqni {v} da tugatdingiz": { en: 'You ended the call at {v}', ru: 'Вы завершили звонок на {v}' },
  "AI qo'ng'iroqni tahlil qilmoqda…": { en: 'AI is analysing the call…', ru: 'AI анализирует звонок…' },
  'Odatda 10-20 soniya oladi.': { en: 'Usually takes 10–20 seconds.', ru: 'Обычно занимает 10–20 секунд.' },
  "Baholash uchun kamida 30 soniya va 2 ta gapingiz kerak. Yana bir bor urinib ko'ring.": {
    en: 'Scoring needs at least 30 seconds and 2 of your messages. Give it another try.',
    ru: 'Для оценки нужно минимум 30 секунд и 2 ваши реплики. Попробуйте ещё раз.',
  },
  'AI provayder ulanmagan': { en: 'The AI provider is not connected', ru: 'AI-провайдер не подключён' },
  "Tahlil qilib bo'lmadi": { en: "Couldn't analyse", ru: 'Не удалось проанализировать' },
  "Qo'ng'iroq matni saqlangan — qayta tahlil qilishingiz mumkin.": {
    en: 'The call transcript is saved — you can analyse it again.',
    ru: 'Расшифровка звонка сохранена — можно проанализировать заново.',
  },
  'Qayta tahlil qilish': { en: 'Analyse again', ru: 'Проанализировать заново' },
  'Maqsadga erishildi': { en: 'Goal achieved', ru: 'Цель достигнута' },
  'Maqsadga hali erishilmadi': { en: 'Goal not achieved yet', ru: 'Цель пока не достигнута' },
  'Umumiy baho': { en: 'Overall score', ru: 'Общая оценка' },
  'Keyingi safar': { en: 'Next time', ru: 'В следующий раз' },
  "Shunday deb ko'ring:": { en: 'Try saying:', ru: 'Попробуйте сказать:' },
  'Qayta urinish · {n} daqiqa': { en: 'Try again · {n} minutes', ru: 'Ещё раз · {n} мин' },
  "To'liq tahlilni ko'rish": { en: 'See full analysis', ru: 'Полный анализ' },
  "Matn va barcha baholar — faqat siz ko'rasiz.": { en: 'Transcript and all scores — only you can see them.', ru: 'Расшифровку и все оценки видите только вы.' },
  Baholar: { en: 'Scores', ru: 'Оценки' },
  "Qo'ng'iroq matni": { en: 'Call transcript', ru: 'Расшифровка звонка' },
  "Matn yo'q": { en: 'No transcript', ru: 'Расшифровки нет' },
  '{ism} haqiqiy mijozdek tuyuldimi?': { en: 'Did {ism} feel like a real client?', ru: '{ism} была похожа на настоящего клиента?' },
  Yumshoq: { en: 'Soft', ru: 'Мягкое' },
  Qattiq: { en: 'Tough', ru: 'Жёсткое' },
  Qisman: { en: 'Partly', ru: 'Частично' },

  // ─── Server xatolari ───
  'Ssenariy topilmadi': { en: 'Scenario not found', ru: 'Сценарий не найден' },
  'Mashq topilmadi': { en: 'Practice call not found', ru: 'Тренировка не найдена' },
  'Mashq allaqachon tugagan': { en: 'This practice call has already ended', ru: 'Тренировка уже завершена' },
  'Mashq vaqti tugagan': { en: 'Practice time is up', ru: 'Время тренировки вышло' },
  "Mashq juda uzun bo'lib ketdi — yakunlang": { en: 'The practice call is too long — please end it', ru: 'Тренировка слишком длинная — завершите её' },
};

export default SIMULYATOR;
