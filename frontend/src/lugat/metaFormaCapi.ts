import type { Lugat } from './index';

/**
 * Meta formalari (yo'nalish, savol → maydon xaritasi, teg, avto-taqsimot) va
 * Conversions API (bitim bosqichi → Meta hodisasi) — pages/crm/MetaFormaCapi.tsx.
 */
const META_FORMA_CAPI: Lugat = {
  // ─── Formalar ───
  'Formalar: yo‘nalish, maydonlar va taqsimot': { en: 'Forms: routing, fields and distribution', ru: 'Формы: маршрутизация, поля и распределение' },
  'Har forma qaysi voronkaga tushadi, savollar qaysi maydonga yoziladi, kimga tayinlanadi': {
    en: 'Which pipeline each form goes to, which field each question fills, and who gets the lead',
    ru: 'В какую воронку попадает каждая форма, в какие поля пишутся ответы и кому назначается лид',
  },
  'Forma birinchi lid kelganda shu yerda o‘zi paydo bo‘ladi — keyin uni sozlaysiz. Avvalgi lidlarga ta’sir qilmaydi.': {
    en: 'A form appears here automatically with its first lead — then you configure it. Earlier leads are not affected.',
    ru: 'Форма появится здесь автоматически с первым лидом — после этого её можно настроить. Прошлые лиды не меняются.',
  },
  oxirgisi: { en: 'last', ru: 'последний' },
  'standart voronka': { en: 'default pipeline', ru: 'воронка по умолчанию' },
  'avto-taqsimot': { en: 'auto-assign', ru: 'автораспределение' },
  '{n} ta maydon xaritasi': { en: '{n} mapped fields', ru: 'сопоставлено полей: {n}' },
  Sozlash: { en: 'Configure', ru: 'Настроить' },
  Saqlanmadi: { en: 'Not saved', ru: 'Не сохранено' },
  Voronka: { en: 'Pipeline', ru: 'Воронка' },
  'Standart (ulanish sozlamasidagi)': { en: 'Default (from the connection settings)', ru: 'По умолчанию (из настроек подключения)' },
  'Savollar → CRM': { en: 'Questions → CRM', ru: 'Вопросы → CRM' },
  'Ism, telefon va email standart savollari o‘zi taniladi; o‘zbekcha «Ismingiz?», «Telefon raqamingiz?» ham. Qolgan javoblar doim izohda ham saqlanadi.': {
    en: 'Standard name, phone and email questions are recognised automatically, including Uzbek “Ismingiz?” and “Telefon raqamingiz?”. All answers are also kept in the note.',
    ru: 'Стандартные вопросы имени, телефона и email распознаются автоматически, в том числе узбекские «Ismingiz?», «Telefon raqamingiz?». Все ответы также сохраняются в примечании.',
  },
  'Savollar birinchi lid bilan keladi.': { en: 'Questions arrive with the first lead.', ru: 'Вопросы придут вместе с первым лидом.' },
  'Izohga (avtomatik aniqlash)': { en: 'To note (auto-detect)', ru: 'В примечание (автоопределение)' },
  'Kontakt: ism': { en: 'Contact: name', ru: 'Контакт: имя' },
  'Kontakt: telefon': { en: 'Contact: phone', ru: 'Контакт: телефон' },
  'Kontakt: email': { en: 'Contact: email', ru: 'Контакт: email' },
  'Bitim maydonlari': { en: 'Deal fields', ru: 'Поля сделки' },
  'Kelishi bilan bitim yaratish va mas’ul tayinlash': { en: 'Create a deal and assign an owner on arrival', ru: 'Сразу создавать сделку и назначать ответственного' },
  'amoCRM’dagi «Taqsimot» boti kabi: lid «Saralanmagan»da kutmaydi, mas’ullar navbat bilan beriladi.': {
    en: 'Like a distribution bot in amoCRM: the lead does not wait in “Unsorted”, owners are assigned in turn.',
    ru: 'Как бот распределения в amoCRM: лид не ждёт в «Неразобранном», ответственные назначаются по очереди.',
  },
  Bosqich: { en: 'Stage', ru: 'Этап' },
  'Voronkaning birinchi bosqichi': { en: 'First stage of the pipeline', ru: 'Первый этап воронки' },
  'Avval voronka tanlang': { en: 'Choose a pipeline first', ru: 'Сначала выберите воронку' },
  'Mas’ullar navbati': { en: 'Owner rotation', ru: 'Очередь ответственных' },
  'Menejerlar yo‘q': { en: 'No managers', ru: 'Нет менеджеров' },
  'Hech kim tanlanmasa — CRM’ning umumiy navbati.': { en: 'If nobody is selected, the CRM-wide rotation is used.', ru: 'Если никто не выбран — общая очередь CRM.' },

  // ─── Conversions API ───
  Bajarilmadi: { en: 'Failed', ru: 'Не выполнено' },
  'Saqlandi — token va dataset Meta’da tekshirildi.': { en: 'Saved — the token and dataset were verified with Meta.', ru: 'Сохранено — токен и датасет проверены в Meta.' },
  'Natijani Meta’ga qaytarish (Conversions API)': { en: 'Send results back to Meta (Conversions API)', ru: 'Передача результатов в Meta (Conversions API)' },
  'Bitim bosqichga kirganda Meta’ga hodisa yuboriladi — reklama sifatli lid va to‘lov bo‘yicha optimallashadi': {
    en: 'When a deal enters a stage, an event is sent to Meta so ads optimise for qualified leads and payments',
    ru: 'Когда сделка попадает на этап, в Meta отправляется событие — реклама оптимизируется на качественные лиды и оплаты',
  },
  Dataset: { en: 'Dataset', ru: 'Датасет' },
  token: { en: 'token', ru: 'токен' },
  'sinov rejimi': { en: 'test mode', ru: 'тестовый режим' },
  'o‘chiq': { en: 'off', ru: 'выключено' },
  xato: { en: 'error', ru: 'ошибка' },
  ulangan: { en: 'connected', ru: 'подключено' },
  'O‘chirish##holat': { en: 'Turn off', ru: 'Выключить' },
  'O‘chirish': { en: 'Delete', ru: 'Удалить' },
  Yoqish: { en: 'Turn on', ru: 'Включить' },
  Almashtirish: { en: 'Replace', ru: 'Заменить' },
  Uzish: { en: 'Disconnect', ru: 'Отключить' },
  'Conversions API uzilsinmi? Qoidalar va jurnal saqlanadi.': { en: 'Disconnect the Conversions API? Rules and the log are kept.', ru: 'Отключить Conversions API? Правила и журнал сохранятся.' },
  'Events Manager → Data sources → dataset (Pixel) → Settings → Conversions API → «Generate access token». Token shifrlangan saqlanadi va qayta ko‘rsatilmaydi.': {
    en: 'Events Manager → Data sources → dataset (Pixel) → Settings → Conversions API → “Generate access token”. The token is stored encrypted and never shown again.',
    ru: 'Events Manager → Источники данных → датасет (Pixel) → Настройки → Conversions API → «Generate access token». Токен хранится в зашифрованном виде и больше не показывается.',
  },
  'Dataset (Pixel) ID': { en: 'Dataset (Pixel) ID', ru: 'ID датасета (Pixel)' },
  'Yangi token (bo‘sh — eskisi qoladi)': { en: 'New token (empty keeps the current one)', ru: 'Новый токен (пусто — останется прежний)' },
  'Access token': { en: 'Access token', ru: 'Токен доступа' },
  'Test event code (ixtiyoriy)': { en: 'Test event code (optional)', ru: 'Test event code (необязательно)' },
  'Tekshirilmoqda…': { en: 'Checking…', ru: 'Проверка…' },
  'Saqlash va tekshirish': { en: 'Save and verify', ru: 'Сохранить и проверить' },
  'Qoidalar: bosqich → hodisa': { en: 'Rules: stage → event', ru: 'Правила: этап → событие' },
  'Qoida yo‘q — hech narsa yuborilmaydi.': { en: 'No rules — nothing is sent.', ru: 'Правил нет — ничего не отправляется.' },
  summa: { en: 'amount', ru: 'сумма' },
  'Meta hodisasi': { en: 'Meta event', ru: 'Событие Meta' },
  'Bitim summasini yuborish': { en: 'Send the deal amount', ru: 'Передавать сумму сделки' },
  'Qo‘shish': { en: 'Add', ru: 'Добавить' },
  'Qoida qo‘shildi. Bundan oldin bosqichga kirgan bitimlar yuborilmaydi.': {
    en: 'Rule added. Deals that entered the stage before now are not sent.',
    ru: 'Правило добавлено. Сделки, попавшие на этап раньше, не отправляются.',
  },
  'To‘lov (yutuq) bosqichi uchun odatda «Purchase» tanlanadi. «Lead» — ariza bosqichlari uchun; aks holda Meta to‘lovni yangi lid deb hisoblaydi.': {
    en: 'A payment (won) stage normally uses “Purchase”. “Lead” is for application stages; otherwise Meta counts the payment as a new lead.',
    ru: 'Для этапа оплаты (успех) обычно выбирают «Purchase». «Lead» — для этапов заявки; иначе Meta посчитает оплату новым лидом.',
  },
  'Jurnal (30 kun)': { en: 'Log (30 days)', ru: 'Журнал (30 дней)' },
  yuborildi: { en: 'sent', ru: 'отправлено' },
  'o‘tkazildi': { en: 'skipped', ru: 'пропущено' },
  navbatda: { en: 'queued', ru: 'в очереди' },
  'Qayta yuborish': { en: 'Resend', ru: 'Отправить повторно' },
  '{n} ta hodisa qayta navbatga qo‘yildi': { en: '{n} events re-queued', ru: 'Повторно в очереди: {n}' },
  Bitim: { en: 'Deal', ru: 'Сделка' },
  Hodisa: { en: 'Event', ru: 'Событие' },
  Holat: { en: 'Status', ru: 'Статус' },
  Vaqt: { en: 'Time', ru: 'Время' },
  sinov: { en: 'test', ru: 'тест' },
  'Telefon, email va ism Meta’ga faqat SHA-256 xeshi bilan ketadi. Lead Ads orqali kelgan bitimlarda Meta lead ID ham yuboriladi — moslash eng aniq bo‘ladi.': {
    en: 'Phone, email and name are sent to Meta only as SHA-256 hashes. For deals from Lead Ads the Meta lead ID is sent too — the most accurate match.',
    ru: 'Телефон, email и имя передаются в Meta только в виде хеша SHA-256. Для сделок из Lead Ads передаётся и Meta lead ID — самое точное сопоставление.',
  },
  'Conversions API ulanmagan': { en: 'Conversions API is not connected', ru: 'Conversions API не подключён' },
  "Yuborish o'chirilgan": { en: 'Sending is turned off', ru: 'Отправка выключена' },
  "Kontaktda telefon, email yoki Meta lead ID yo'q": { en: 'The contact has no phone, email or Meta lead ID', ru: 'У контакта нет телефона, email или Meta lead ID' },
  '7 kundan eski — Meta qabul qilmaydi': { en: 'Older than 7 days — Meta rejects it', ru: 'Старше 7 дней — Meta не принимает' },
};

export default META_FORMA_CAPI;
