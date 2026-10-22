import type { Lugat } from './index';

/**
 * Ichki CRM ilovasi (`pages/crm/*`, `crm/*`, `components/IlovaAlmashtirgich.tsx`)
 * va uning server xabarlari (`backend/src/crm/xizmat.ts`).
 */
const CRM_ILOVA: Lugat = {
  // ─── Almashtirgich va menyu ───
  "CRM ga o'tish": { en: 'Go to CRM', ru: 'Перейти в CRM' },
  'SotuvAI ga qaytish': { en: 'Back to SotuvAI', ru: 'Вернуться в SotuvAI' },
  Bitimlar: { en: 'Deals', ru: 'Сделки' },
  Kontaktlar: { en: 'Contacts', ru: 'Контакты' },
  Integratsiya: { en: 'Integration', ru: 'Интеграция' },

  // ─── Yoqish ───
  'SotuvAI CRM': { en: 'SotuvAI CRM', ru: 'SotuvAI CRM' },
  "Bitimlar, kontaktlar va vazifalar — qo'ng'iroq tahlillari bilan bir joyda. Mijoz qo'ng'iroq qilsa, uning bitimida suhbat va AI bahosi o'zi paydo bo'ladi.": {
    en: 'Deals, contacts and tasks — in one place with call analyses. When a client calls, the conversation and its AI score appear on their deal automatically.',
    ru: 'Сделки, контакты и задачи — в одном месте с анализом звонков. Когда клиент звонит, разговор и оценка ИИ сами появляются в его сделке.',
  },
  'Boshlash uchun shablon tanlang': { en: 'Choose a template to start', ru: 'Выберите шаблон для начала' },
  "Voronka, bosqich va maydonlarni keyin Sozlamalarda o'zgartirasiz.": {
    en: 'You can change pipelines, stages and fields later in Settings.',
    ru: 'Воронки, этапы и поля можно изменить позже в настройках.',
  },
  '{v} ta voronka · {m} ta maydon': { en: '{v} pipelines · {m} fields', ru: 'Воронок: {v} · полей: {m}' },
  'Yoqilmoqda…': { en: 'Enabling…', ru: 'Включение…' },
  'CRM ni yoqish': { en: 'Enable CRM', ru: 'Включить CRM' },
  'Yoqib bo‘lmadi': { en: 'Could not enable', ru: 'Не удалось включить' },
  'CRM hali yoqilmagan. Rahbaringiz uni yoqqach, bitimlaringiz shu yerda ko‘rinadi.': {
    en: 'The CRM is not enabled yet. Once your manager enables it, your deals will appear here.',
    ru: 'CRM ещё не включена. Когда руководитель её включит, ваши сделки появятся здесь.',
  },
  'amoCRM yoki Bitrix24 ishlatasizmi?': { en: 'Using amoCRM or Bitrix24?', ru: 'Используете amoCRM или Bitrix24?' },
  "Mavjud CRM ni ulang — SotuvAI tahlillarni o'sha yerga yozadi.": {
    en: 'Connect your existing CRM — SotuvAI will write the analyses there.',
    ru: 'Подключите вашу CRM — SotuvAI будет записывать анализы туда.',
  },
  "Bo'sh": { en: 'Blank', ru: 'Пустой' },
  "Ta'lim markazi": { en: 'Education centre', ru: 'Учебный центр' },
  'Bitta «Sotuv» voronkasi — keyin o‘zingiz moslaysiz': {
    en: 'One “Sales” pipeline — adjust it yourself later',
    ru: 'Одна воронка «Продажи» — дальше настроите сами',
  },
  'IT Live namunasi: 5 voronka, filial, kurs, uchrashuv va ota-ona maydonlari': {
    en: 'IT Live sample: 5 pipelines, branch, course, appointment and parent fields',
    ru: 'Образец IT Live: 5 воронок, поля филиала, курса, встречи и родителей',
  },

  // ─── Bitimlar ───
  Kanban: { en: 'Kanban', ru: 'Канбан' },
  Jadval: { en: 'Table', ru: 'Таблица' },
  'Yangi bitim': { en: 'New deal', ru: 'Новая сделка' },
  'Bitim, mijoz yoki telefon': { en: 'Deal, client or phone', ru: 'Сделка, клиент или телефон' },
  'Bitimlarni qidirish': { en: 'Search deals', ru: 'Поиск сделок' },
  "Barcha mas'ullar": { en: 'All owners', ru: 'Все ответственные' },
  "Ko'chirib bo'lmadi": { en: 'Could not move', ru: 'Не удалось переместить' },
  '{n} ta bitim': { en: '{n} deals', ru: 'Сделок: {n}' },
  'Yana {n} ta — jadvalda': { en: '{n} more — in the table', ru: 'Ещё {n} — в таблице' },
  "Bitim yo'q": { en: 'No deals', ru: 'Нет сделок' },
  Bosqichda: { en: 'In stage', ru: 'На этапе' },
  'bugun {v}': { en: 'today {v}', ru: 'сегодня {v}' },
  "Bitim yo'qotildi": { en: 'Deal lost', ru: 'Сделка проиграна' },
  "Yo'qotildi deb belgilash": { en: 'Mark as lost', ru: 'Отметить как проигранную' },
  'Sababi (ixtiyoriy)': { en: 'Reason (optional)', ru: 'Причина (необязательно)' },
  'Masalan: qimmat, boshqa markazni tanladi': {
    en: 'E.g. too expensive, chose another centre',
    ru: 'Например: дорого, выбрал другой центр',
  },
  'Bitimlar topilmadi': { en: 'No deals found', ru: 'Сделки не найдены' },
  'Keyingi vazifa': { en: 'Next task', ru: 'Следующая задача' },
  'Bitim nomini yoki mijoz ismini kiriting': {
    en: 'Enter a deal name or the client’s name',
    ru: 'Введите название сделки или имя клиента',
  },
  'Bitim nomi': { en: 'Deal name', ru: 'Название сделки' },
  'Bo‘sh qolsa — mijoz ismi': { en: 'If empty — the client’s name', ru: 'Если пусто — имя клиента' },
  'Mijoz ismi': { en: 'Client name', ru: 'Имя клиента' },
  "Bu raqamli mijoz bazada bo'lsa, bitim unga bog'lanadi — qo'ng'iroqlari ham ko'rinadi.": {
    en: 'If a client with this number exists, the deal is linked to them — their calls will show too.',
    ru: 'Если клиент с этим номером уже есть, сделка привяжется к нему — его звонки тоже будут видны.',
  },

  // ─── Bitim kartochkasi ───
  'Yaratilgan: {v}': { en: 'Created: {v}', ru: 'Создана: {v}' },
  "Bitimni o'chirish": { en: 'Delete deal', ru: 'Удалить сделку' },
  'Bosqichga o‘tkazish': { en: 'Move to stage', ru: 'Перевести на этап' },
  "Yo'qotish sababi:": { en: 'Loss reason:', ru: 'Причина проигрыша:' },
  "Asosiy ma'lumot": { en: 'Main details', ru: 'Основные данные' },
  Ismsiz: { en: 'No name', ru: 'Без имени' },
  'Kontakt biriktirilmagan.': { en: 'No contact attached.', ru: 'Контакт не привязан.' },
  "O'zgarishlar saqlanmagan": { en: 'Unsaved changes', ru: 'Изменения не сохранены' },
  '«{n}» bitimi o‘chiriladi. Kontakt va qo‘ng‘iroqlar saqlanib qoladi.': {
    en: 'The deal “{n}” will be deleted. The contact and calls are kept.',
    ru: 'Сделка «{n}» будет удалена. Контакт и звонки сохранятся.',
  },
  "Ochiq vazifa yo'q — keyingi qadamni belgilang, bitim unutilib qolmasin.": {
    en: 'No open task — set the next step so the deal is not forgotten.',
    ru: 'Нет открытой задачи — назначьте следующий шаг, чтобы сделка не потерялась.',
  },
  'Bajarildi deb belgilash': { en: 'Mark as done', ru: 'Отметить выполненной' },
  'Qayta ochish': { en: 'Reopen', ru: 'Открыть снова' },
  'Vazifa matnini kiriting': { en: 'Enter the task text', ru: 'Введите текст задачи' },
  'Qo‘shish': { en: 'Add', ru: 'Добавить' },
  'Nima qilish kerak': { en: 'What needs to be done', ru: 'Что нужно сделать' },
  "Masalan: qayta qo'ng'iroq qilish": { en: 'E.g. call back', ru: 'Например: перезвонить' },
  Ertaga: { en: 'Tomorrow', ru: 'Завтра' },
  'Bir haftadan keyin': { en: 'In a week', ru: 'Через неделю' },
  'Izoh (ixtiyoriy)': { en: 'Comment (optional)', ru: 'Комментарий (необязательно)' },
  xodim: { en: 'employee', ru: 'сотрудник' },
  'hech kim': { en: 'nobody', ru: 'никто' },
  'Bitim yaratildi — «{b}»': { en: 'Deal created — “{b}”', ru: 'Сделка создана — «{b}»' },
  'Bosqich: «{a}» → «{b}»': { en: 'Stage: “{a}” → “{b}”', ru: 'Этап: «{a}» → «{b}»' },
  'Bosqich o‘zgardi': { en: 'Stage changed', ru: 'Этап изменён' },
  "Mas'ul: {a} → {b}": { en: 'Owner: {a} → {b}', ru: 'Ответственный: {a} → {b}' },
  'Kontakt o‘zgardi': { en: 'Contact changed', ru: 'Контакт изменён' },
  'Nomi: «{a}» → «{b}»': { en: 'Name: “{a}” → “{b}”', ru: 'Название: «{a}» → «{b}»' },
  'Summa: {a} → {b}': { en: 'Amount: {a} → {b}', ru: 'Сумма: {a} → {b}' },
  '«{m}»: {a} → {b}': { en: '“{m}”: {a} → {b}', ru: '«{m}»: {a} → {b}' },
  Maydon: { en: 'Field', ru: 'Поле' },
  Tarix: { en: 'History', ru: 'История' },
  'Tarix filtri': { en: 'History filter', ru: 'Фильтр истории' },
  Izohlar: { en: 'Notes', ru: 'Примечания' },
  'Izoh yozing…': { en: 'Write a note…', ru: 'Напишите примечание…' },
  "Bu mijoz bilan SotuvAI orqali qo'ng'iroq hali yo'q. Qo'ng'iroq bo'lsa, tahlili shu yerda o'zi chiqadi.": {
    en: 'No calls with this client through SotuvAI yet. When there is one, its analysis appears here automatically.',
    ru: 'Звонков с этим клиентом через SotuvAI пока нет. Когда звонок будет, его анализ появится здесь сам.',
  },
  "Chiquvchi qo'ng'iroq": { en: 'Outgoing call', ru: 'Исходящий звонок' },
  "Kiruvchi qo'ng'iroq": { en: 'Incoming call', ru: 'Входящий звонок' },

  // ─── Kontaktlar ───
  'Yangi kontakt': { en: 'New contact', ru: 'Новый контакт' },
  'Ism, kompaniya yoki telefon': { en: 'Name, company or phone', ru: 'Имя, компания или телефон' },
  'Kontaktlarni qidirish': { en: 'Search contacts', ru: 'Поиск контактов' },
  'Kontaktlar topilmadi': { en: 'No contacts found', ru: 'Контакты не найдены' },
  'Oxirgi faollik': { en: 'Last activity', ru: 'Последняя активность' },
  'Ismni kiriting': { en: 'Enter a name', ru: 'Введите имя' },
  'Kontaktni tahrirlash': { en: 'Edit contact', ru: 'Редактировать контакт' },
  "Bu kontaktda bitim yo'q.": { en: 'This contact has no deals.', ru: 'У этого контакта нет сделок.' },
  "SotuvAI qo'ng'iroqlari": { en: 'SotuvAI calls', ru: 'Звонки SotuvAI' },
  "Bu mijoz bilan qo'ng'iroq hali yo'q.": { en: 'No calls with this client yet.', ru: 'Звонков с этим клиентом пока нет.' },

  // ─── Vazifalar ───
  "Bajarilgan vazifa yo'q": { en: 'No completed tasks', ru: 'Нет выполненных задач' },

  // ─── Sozlamalar ───
  Voronkalar: { en: 'Pipelines', ru: 'Воронки' },
  Maydonlar: { en: 'Fields', ru: 'Поля' },
  '{n} ta bosqich': { en: '{n} stages', ru: 'Этапов: {n}' },
  'Yangi voronka': { en: 'New pipeline', ru: 'Новая воронка' },
  "Bitimlari saqlanadi, ro'yxatdan yashiriladi": {
    en: 'Its deals are kept, it is hidden from the list',
    ru: 'Сделки сохранятся, воронка скроется из списка',
  },
  Arxivlash: { en: 'Archive', ru: 'В архив' },
  "Tartib — Kanban ustunlari tartibi. Kamida bitta ochiq, bitta muvaffaqiyatli va bitta yo'qotilgan bosqich kerak.": {
    en: 'The order is the Kanban column order. At least one open, one won and one lost stage are required.',
    ru: 'Порядок — это порядок колонок канбана. Нужен хотя бы один открытый, один успешный и один проигранный этап.',
  },
  Rang: { en: 'Colour', ru: 'Цвет' },
  'Yangi bosqich': { en: 'New stage', ru: 'Новый этап' },
  'Voronka nomini kiriting': { en: 'Enter a pipeline name', ru: 'Введите название воронки' },
  "Standart bosqichlar bilan yaratiladi — keyin o'zgartirasiz.": {
    en: 'It is created with default stages — change them later.',
    ru: 'Создаётся со стандартными этапами — измените их позже.',
  },
  "Bitimning qo'shimcha maydonlari": { en: 'Custom deal fields', ru: 'Дополнительные поля сделки' },
  "Hali maydon yo'q.": { en: 'No fields yet.', ru: 'Полей пока нет.' },
  '{n} ta variant': { en: '{n} options', ru: 'Вариантов: {n}' },
  'Arxivlash — eski qiymatlar saqlanadi': { en: 'Archive — existing values are kept', ru: 'В архив — старые значения сохранятся' },
  'Maydon nomini kiriting': { en: 'Enter a field name', ru: 'Введите название поля' },
  'Kamida bitta variant kiriting': { en: 'Enter at least one option', ru: 'Введите хотя бы один вариант' },
  'Maydonni tahrirlash': { en: 'Edit field', ru: 'Редактировать поле' },
  'Yangi maydon': { en: 'New field', ru: 'Новое поле' },
  "Turi o'zgarmaydi — eski qiymatlar buzilmasligi uchun.": {
    en: 'The type cannot change — so existing values stay valid.',
    ru: 'Тип не меняется — чтобы не испортить сохранённые значения.',
  },
  'Majburiy maydon': { en: 'Required field', ru: 'Обязательное поле' },
  'Variant {n}': { en: 'Option {n}', ru: 'Вариант {n}' },
  Variant: { en: 'Option', ru: 'Вариант' },
  '— tanlanmagan —': { en: '— not selected —', ru: '— не выбрано —' },
  Muvaffaqiyatli: { en: 'Won', ru: 'Успешно' },
  "Yo'qotilgan": { en: 'Lost', ru: 'Проиграно' },
  'Uzun matn': { en: 'Long text', ru: 'Длинный текст' },
  Pul: { en: 'Money', ru: 'Деньги' },
  "Ro'yxat (bitta)": { en: 'List (single)', ru: 'Список (один)' },
  "Ro'yxat (bir nechta)": { en: 'List (multiple)', ru: 'Список (несколько)' },
  'Sana va vaqt': { en: 'Date and time', ru: 'Дата и время' },
  'Belgi (ha/yo‘q)': { en: 'Checkbox (yes/no)', ru: 'Флажок (да/нет)' },
  'Call-Center': { en: 'Call centre', ru: 'Колл-центр' },
  Administratsiya: { en: 'Administration', ru: 'Администрация' },

  // ─── Server xabarlari (backend/src/crm/xizmat.ts, routes/crm-app.ts) ───
  'CRM allaqachon yoqilgan': { en: 'The CRM is already enabled', ru: 'CRM уже включена' },
  'Bitim topilmadi': { en: 'Deal not found', ru: 'Сделка не найдена' },
  "Bu bitimni o'zgartirishga ruxsatingiz yo'q": {
    en: 'You are not allowed to change this deal',
    ru: 'У вас нет прав изменять эту сделку',
  },
  "Bitimni boshqa foydalanuvchi o'zgartirdi — sahifani yangilab, qayta urinib ko'ring": {
    en: 'Another user changed this deal — refresh and try again',
    ru: 'Сделку изменил другой пользователь — обновите страницу и попробуйте снова',
  },
  "Mas'ulni faqat rahbar o'zgartira oladi": {
    en: 'Only a manager can change the owner',
    ru: 'Ответственного может менять только руководитель',
  },
  'Kontakt topilmadi': { en: 'Contact not found', ru: 'Контакт не найден' },
  'Bosqich shu voronkaga tegishli emas': {
    en: 'The stage does not belong to this pipeline',
    ru: 'Этап не относится к этой воронке',
  },
  'Bosqich topilmadi': { en: 'Stage not found', ru: 'Этап не найден' },
  "Mas'ul topilmadi": { en: 'Owner not found', ru: 'Ответственный не найден' },
  "Bitim yaratish uchun menejer o'rningiz bo'lishi kerak": {
    en: 'You need a sales seat to create deals',
    ru: 'Чтобы создавать сделки, нужно место менеджера',
  },
  'Bu raqamli kontakt allaqachon bor': {
    en: 'A contact with this number already exists',
    ru: 'Контакт с этим номером уже существует',
  },
  "Oxirgi voronkani arxivlab bo'lmaydi": {
    en: 'The last pipeline cannot be archived',
    ru: 'Последнюю воронку нельзя отправить в архив',
  },
  'Voronka topilmadi': { en: 'Pipeline not found', ru: 'Воронка не найдена' },
  "Voronkada kamida bitta ochiq, bitta muvaffaqiyatli va bitta yo'qotilgan bosqich bo'lishi kerak": {
    en: 'A pipeline needs at least one open, one won and one lost stage',
    ru: 'В воронке должен быть хотя бы один открытый, один успешный и один проигранный этап',
  },
  'Maydon topilmadi': { en: 'Field not found', ru: 'Поле не найдено' },
  "CRM dan foydalanish uchun ruxsatingiz yo'q": {
    en: 'You do not have access to the CRM',
    ru: 'У вас нет доступа к CRM',
  },
  'Bitim nomini kiriting': { en: 'Enter a deal name', ru: 'Введите название сделки' },
  "Email noto'g'ri": { en: 'Invalid email', ru: 'Неверный email' },
  'Bosqich nomini kiriting': { en: 'Enter a stage name', ru: 'Введите название этапа' },
  'Izoh matnini kiriting': { en: 'Enter the note text', ru: 'Введите текст примечания' },
  "Summa raqam bo'lishi kerak": { en: 'The amount must be a number', ru: 'Сумма должна быть числом' },
  "Summa manfiy bo'lmasin": { en: 'The amount cannot be negative', ru: 'Сумма не может быть отрицательной' },
  'Summa juda katta': { en: 'The amount is too large', ru: 'Слишком большая сумма' },
  "O'chirilayotgan bosqichda bitimlar bor — avval ularni boshqa bosqichga o'tkazing": {
    en: 'The stage being removed has deals — move them to another stage first',
    ru: 'На удаляемом этапе есть сделки — сначала перенесите их на другой этап',
  },
};

export default CRM_ILOVA;
