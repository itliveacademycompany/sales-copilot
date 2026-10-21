import type { Lugat } from './index';

/**
 * SaaS: mijoz kabinetlari — super admin "Mijozlar" paneli, subdomendagi
 * kirish, taklif, "kabinet topilmadi" / "kirish huquqi yo'q" ekranlari
 * va server qaytaradigan xato matnlari.
 */
const SAAS: Lugat = {
  // ─── Mijozlar paneli ───
  Mijozlar: { en: 'Customers', ru: 'Клиенты' },
  "Har bir mijoz — o'z subdomenidagi alohida kabinet: faqat shu biznes xodimlari kira oladi, boshqa mijozlar ma'lumoti umuman ko'rinmaydi.": {
    en: "Each customer gets a separate workspace on its own subdomain: only that business's staff can sign in, and other customers' data is never visible.",
    ru: 'Каждый клиент — отдельный кабинет на своём поддомене: войти могут только сотрудники этого бизнеса, данные других клиентов полностью скрыты.',
  },
  'Yangi mijoz': { en: 'New customer', ru: 'Новый клиент' },
  "Hali mijoz yo'q — birinchisini «Yangi mijoz» tugmasi bilan yarating.": {
    en: 'No customers yet — create the first one with the “New customer” button.',
    ru: 'Клиентов пока нет — создайте первого кнопкой «Новый клиент».',
  },
  "Kabinet manzili domen sozlamasidan olinadi (serverdagi WEB_ORIGIN). Domen o'zgarsa, barcha kabinetlar yangi domen ostida avtomatik ishlaydi — kodni o'zgartirish shart emas.": {
    en: 'Workspace addresses come from the domain setting (WEB_ORIGIN on the server). If the domain changes, every workspace automatically works under the new domain — no code changes needed.',
    ru: 'Адрес кабинета берётся из настройки домена (WEB_ORIGIN на сервере). Если домен изменится, все кабинеты автоматически заработают на новом домене — менять код не нужно.',
  },
  'Kabinet yaratilmadi': { en: 'Workspace was not created', ru: 'Кабинет не создан' },
  'Yangi mijoz kabineti': { en: 'New customer workspace', ru: 'Новый кабинет клиента' },
  'Biznes nomi': { en: 'Business name', ru: 'Название бизнеса' },
  "masalan: Yo'lchi o'quv markazi": { en: 'e.g. Bright Learning Center', ru: 'например: Учебный центр «Ориентир»' },
  Subdomen: { en: 'Subdomain', ru: 'Поддомен' },
  'Lotin kichik harflari, raqam va chiziqcha; 3–40 belgi.': {
    en: 'Lowercase Latin letters, digits and hyphens; 3–40 characters.',
    ru: 'Строчные латинские буквы, цифры и дефис; 3–40 символов.',
  },
  "{manzil} — bo'sh": { en: '{manzil} — available', ru: '{manzil} — свободен' },
  "Tekshirib bo'lmadi": { en: "Couldn't check", ru: 'Не удалось проверить' },
  'Ega ismi': { en: 'Owner name', ru: 'Имя владельца' },
  'masalan: Aziz Karimov': { en: 'e.g. Aziz Karimov', ru: 'например: Азиз Каримов' },
  "Shu email bilan kiradi. Email tizimda bo'lsa — bu odamga yangi kabinet qo'shiladi.": {
    en: 'They sign in with this email. If the email already exists, the new workspace is added to that person.',
    ru: 'Вход по этому email. Если email уже есть в системе, новый кабинет добавится этому человеку.',
  },
  'Kabinet tili': { en: 'Workspace language', ru: 'Язык кабинета' },
  'Sinov muddati (kun)': { en: 'Trial period (days)', ru: 'Пробный период (дни)' },
  'Kabinetni yaratish': { en: 'Create workspace', ru: 'Создать кабинет' },
  'Yaratilmoqda…': { en: 'Creating…', ru: 'Создание…' },

  // ─── Yaratildi kartasi ───
  '«{nom}» kabineti tayyor': { en: '“{nom}” workspace is ready', ru: 'Кабинет «{nom}» готов' },
  'Kabinet darhol ishlaydi — alohida sozlash yoki deploy kerak emas.': {
    en: 'The workspace works right away — no extra setup or deployment needed.',
    ru: 'Кабинет работает сразу — отдельная настройка или деплой не нужны.',
  },
  'Kabinet manzili': { en: 'Workspace address', ru: 'Адрес кабинета' },
  "Ega tizimda allaqachon bor — u o'z paroli bilan kabinet manzilida kiradi. Kerak bo'lsa, «Tahrirlash» orqali yangisini bering.": {
    en: 'The owner already has an account — they sign in at the workspace address with their current password. If needed, issue a new one via “Edit”.',
    ru: 'Владелец уже есть в системе — он входит по адресу кабинета со своим паролем. При необходимости выдайте новый через «Редактировать».',
  },
  "Ma'lumotni egaga yuboring (Telegram, email). Parol faqat hozir ko'rinadi — keyin faqat yangisini o'rnatish mumkin.": {
    en: 'Send these details to the owner (Telegram, email). The password is shown only now — later you can only set a new one.',
    ru: 'Отправьте данные владельцу (Telegram, email). Пароль виден только сейчас — потом можно лишь задать новый.',
  },
  'Hammasini nusxalash': { en: 'Copy all', ru: 'Копировать всё' },
  Nusxalash: { en: 'Copy', ru: 'Копировать' },
  Nusxalandi: { en: 'Copied', ru: 'Скопировано' },
  Ochish: { en: 'Open', ru: 'Открыть' },

  // ─── Ro'yxat qatori ───
  Sinov: { en: 'Trial', ru: 'Пробный' },
  "To'lov kechikkan": { en: 'Payment overdue', ru: 'Просрочен платёж' },
  Cheklangan: { en: 'Restricted', ru: 'Ограничен' },
  'Subdomen yaroqsiz': { en: 'Invalid subdomain', ru: 'Недопустимый поддомен' },
  "ega yo'q": { en: 'no owner', ru: 'нет владельца' },
  'parol berilmagan': { en: 'no password set', ru: 'пароль не задан' },
  'Yaratilgan: {sana}': { en: 'Created: {sana}', ru: 'Создан: {sana}' },
  '{a} rahbar, {s} menejer': { en: '{a} supervisors, {s} reps', ru: 'руководителей: {a}, менеджеров: {s}' },
  'sinov {sana} gacha': { en: 'trial until {sana}', ru: 'пробный до {sana}' },
  // ─── Qator amallari: tahrirlash, faolsizlantirish, o'chirish, subdomen ───
  Faolsiz: { en: 'Suspended', ru: 'Приостановлен' },
  "To'xtatilgan: {sana}": { en: 'Suspended: {sana}', ru: 'Приостановлен: {sana}' },
  'Kabinet manzilini nusxalash': { en: 'Copy the workspace address', ru: 'Скопировать адрес кабинета' },
  'Subdomen berish': { en: 'Assign subdomain', ru: 'Назначить поддомен' },
  Kabinet: { en: 'Workspace', ru: 'Кабинет' },
  'Ega va kirish': { en: 'Owner and sign-in', ru: 'Владелец и вход' },
  "O'zgarishlar saqlandi.": { en: 'Changes saved.', ru: 'Изменения сохранены.' },
  'Saqlandi. Yangi parol berildi — ega barcha qurilmalardan chiqarildi va endi shu parol bilan kiradi.': {
    en: 'Saved. A new password was issued — the owner was signed out on all devices and now signs in with it.',
    ru: 'Сохранено. Выдан новый пароль — владелец вышел на всех устройствах и теперь входит с ним.',
  },
  "Saqlandi. Login yangilandi — parol o'zgarmadi, ega yangi login va eski paroli bilan kiradi.": {
    en: 'Saved. The login was updated — the password is unchanged; the owner signs in with the new login and current password.',
    ru: 'Сохранено. Логин обновлён — пароль прежний; владелец входит с новым логином и старым паролем.',
  },
  '«{nom}» kabineti faolsizlantirilsinmi?': { en: 'Suspend the “{nom}” workspace?', ru: 'Приостановить кабинет «{nom}»?' },
  "Xodimlar kira olmaydi, subdomenda «vaqtincha to'xtatilgan» xabari chiqadi va yangi suhbatlar tahlil qilinmaydi. Ma'lumotlar saqlanadi — istalgan payt qayta faollashtirasiz.": {
    en: 'Staff will not be able to sign in, the subdomain will show a “temporarily suspended” message and new conversations will not be analysed. Data is kept — you can reactivate it at any time.',
    ru: 'Сотрудники не смогут войти, на поддомене появится сообщение «временно приостановлен», новые разговоры не будут анализироваться. Данные сохраняются — вернуть можно в любой момент.',
  },
  'Bajarilmoqda…': { en: 'Working…', ru: 'Выполняется…' },
  "«{nom}» kabineti o'chirilsinmi?": { en: 'Delete the “{nom}” workspace?', ru: 'Удалить кабинет «{nom}»?' },
  "Kabinet ro'yxatdan, kirishdan va barcha jarayonlardan chiqadi. Ma'lumotlar 90 kun saqlanadi, subdomen boshqa mijozga berilmaydi. Faqat vaqtincha to'xtatmoqchi bo'lsangiz — «Faolsizlantirish»dan foydalaning.": {
    en: 'The workspace is removed from the list, sign-in and all processes. Data is kept for 90 days and the subdomain is never given to another customer. To pause it temporarily, use “Suspend” instead.',
    ru: 'Кабинет исчезнет из списка, входа и всех процессов. Данные хранятся 90 дней, поддомен другому клиенту не передаётся. Если нужно лишь временно остановить — используйте «Приостановить».',
  },
  'Tasdiqlash uchun biznes nomini yozing: {nom}': { en: 'Type the business name to confirm: {nom}', ru: 'Для подтверждения введите название бизнеса: {nom}' },
  "Butunlay o'chirish": { en: 'Delete workspace', ru: 'Удалить кабинет' },
  "Diqqat: subdomen faqat bir marta beriladi — keyin o'zgartirib bo'lmaydi.": {
    en: 'Note: a subdomain is assigned only once — it cannot be changed later.',
    ru: 'Внимание: поддомен назначается один раз — изменить его потом нельзя.',
  },
  'Login (email)': { en: 'Login (email)', ru: 'Логин (email)' },
  'Yangi parol': { en: 'New password', ru: 'Новый пароль' },
  "Ega shu email bilan kiradi. Xato yozilgan bo'lsa — shu yerda tuzating.": {
    en: 'The owner signs in with this email. If it was mistyped, fix it here.',
    ru: 'Владелец входит с этим email. Если он введён с ошибкой — исправьте здесь.',
  },
  "Bo'sh qoldirsangiz — parol o'zgarmaydi. Yangisi berilsa, ega barcha qurilmalardan chiqariladi.": {
    en: 'Leave empty to keep the password. If you set a new one, the owner is signed out on all devices.',
    ru: 'Оставьте пустым — пароль не изменится. При новом пароле владелец выйдет на всех устройствах.',
  },
  '«{email}» ni nazarda tutdingizmi?': { en: 'Did you mean “{email}”?', ru: 'Возможно, вы имели в виду «{email}»?' },
  Tuzatish: { en: 'Fix', ru: 'Исправить' },
  "Email formati noto'g'ri": { en: 'Invalid email format', ru: 'Неверный формат email' },
  'Bu email boshqa hisobga tegishli — boshqasini kiriting': {
    en: 'This email belongs to another account — enter a different one',
    ru: 'Этот email принадлежит другому аккаунту — укажите другой',
  },
  // Server xatolari (routes/tenants.ts)
  "O'zgartirish uchun kamida bitta maydon kerak": { en: 'Change at least one field', ru: 'Измените хотя бы одно поле' },
  "Subdomen yaratilgandan keyin o'zgartirilmaydi — havolalar va xodimlar shu manzilga bog'langan": {
    en: 'A subdomain cannot be changed after it is created — links and staff depend on this address',
    ru: 'Поддомен нельзя изменить после создания — ссылки и сотрудники привязаны к этому адресу',
  },
  "O'zingiz a'zo bo'lgan kabinetni faolsizlantirib bo'lmaydi — aks holda boshqaruv paneliga kira olmay qolasiz": {
    en: "You can't suspend a workspace you are a member of — you would lose access to the admin panel",
    ru: 'Нельзя приостановить кабинет, в котором вы состоите, — вы потеряете доступ к панели управления',
  },
  "O'zingiz a'zo bo'lgan kabinetni o'chirib bo'lmaydi — aks holda boshqaruv paneliga kira olmay qolasiz": {
    en: "You can't delete a workspace you are a member of — you would lose access to the admin panel",
    ru: 'Нельзя удалить кабинет, в котором вы состоите, — вы потеряете доступ к панели управления',
  },
  'Tasdiqlash uchun biznes nomini aynan yozing': { en: 'Type the business name exactly to confirm', ru: 'Для подтверждения введите название бизнеса точно' },
  'Biznes nomi kamida 2 belgi': { en: 'Business name must be at least 2 characters', ru: 'Название бизнеса — не менее 2 символов' },
  'Ega ismi kamida 2 belgi': { en: "Owner's name must be at least 2 characters", ru: 'Имя владельца — не менее 2 символов' },
  'Ega emaili (login)': { en: 'Owner email (login)', ru: 'Email владельца (логин)' },
  'kamida {n} belgi': { en: 'at least {n} characters', ru: 'не менее {n} символов' },
  'Kuchli parol yaratish': { en: 'Generate a strong password', ru: 'Сгенерировать надёжный пароль' },
  "Parol kamida {n} belgi bo'lishi kerak": { en: 'Password must be at least {n} characters', ru: 'Пароль должен содержать не менее {n} символов' },
  "Parolni egaga o'zingiz berasiz — mijoz uni o'zi tiklay olmaydi.": {
    en: "You give the owner the password yourself — the customer can't reset it on their own.",
    ru: 'Пароль владельцу выдаёте вы — клиент не может сбросить его сам.',
  },
  '{nom} — yangi subdomen': { en: '{nom} — new subdomain', ru: '{nom} — новый поддомен' },

  // ─── Subdomendagi kirish va taklif ───
  '«{nom}» kabinetiga kirish': { en: 'Sign in to the “{nom}” workspace', ru: 'Вход в кабинет «{nom}»' },
  'Kabinetingizga xush kelibsiz!': { en: 'Welcome to your workspace!', ru: 'Добро пожаловать в ваш кабинет!' },
  "Kirish uchun parol o'rnating — keyingi safar shu email va parol bilan kirasiz.": {
    en: "Set a password to sign in — next time you'll use this email and password.",
    ru: 'Задайте пароль для входа — в следующий раз входите с этим email и паролем.',
  },

  // ─── Kabinet holatlari ───
  'Kabinet topilmadi': { en: 'Workspace not found', ru: 'Кабинет не найден' },
  "{manzil} manzilida kabinet yo'q. Manzil to'g'ri yozilganini tekshiring yoki asosiy saytga o'ting.": {
    en: "There's no workspace at {manzil}. Check that the address is spelled correctly or go to the main site.",
    ru: 'По адресу {manzil} кабинета нет. Проверьте, правильно ли введён адрес, или перейдите на главный сайт.',
  },
  "Kirish huquqi yo'q": { en: 'No access', ru: 'Нет доступа' },
  'Siz {hisob} sifatida kirgansiz, lekin {kabinet} kabinetining xodimi emassiz.': {
    en: "You're signed in as {hisob}, but you're not a member of the {kabinet} workspace.",
    ru: 'Вы вошли как {hisob}, но не являетесь сотрудником кабинета {kabinet}.',
  },
  'Boshqa hisob bilan kirish': { en: 'Sign in with another account', ru: 'Войти под другим аккаунтом' },
  'Asosiy saytga': { en: 'Go to main site', ru: 'На главный сайт' },
  "Kabinet vaqtincha to'xtatilgan": { en: 'Workspace temporarily suspended', ru: 'Кабинет временно приостановлен' },
  "{kabinet} kabineti administrator tomonidan vaqtincha to'xtatilgan. Ma'lumotlaringiz saqlanadi — qayta ochish uchun administratorga murojaat qiling.": {
    en: 'The {kabinet} workspace has been temporarily suspended by the administrator. Your data is kept — contact the administrator to reopen it.',
    ru: 'Кабинет {kabinet} временно приостановлен администратором. Ваши данные сохранены — чтобы открыть его снова, обратитесь к администратору.',
  },
  "Kabinet vaqtincha to'xtatilgan — administratorga murojaat qiling": {
    en: 'This workspace is temporarily suspended — contact the administrator',
    ru: 'Кабинет временно приостановлен — обратитесь к администратору',
  },

  // ─── Server xato matnlari (backend: tenant.ts, routes/tenants.ts) ───
  "Subdomen 3–40 belgi bo'lishi kerak: lotin kichik harflari, raqam va chiziqcha (boshida/oxirida emas)": {
    en: 'The subdomain must be 3–40 characters: lowercase Latin letters, digits and hyphens (not at the start or end)',
    ru: 'Поддомен должен содержать 3–40 символов: строчные латинские буквы, цифры и дефис (не в начале и не в конце)',
  },
  'Bu subdomen tizim uchun ajratilgan — boshqasini tanlang': {
    en: 'This subdomain is reserved by the system — choose another one',
    ru: 'Этот поддомен зарезервирован системой — выберите другой',
  },
  'Bu subdomen band — boshqasini tanlang': { en: 'This subdomain is taken — choose another one', ru: 'Этот поддомен занят — выберите другой' },
  "Bu email o'chirilgan hisobga tegishli — boshqa email kiriting": {
    en: 'This email belongs to a deleted account — enter a different email',
    ru: 'Этот email принадлежит удалённому аккаунту — укажите другой',
  },
  'Parol kamida 10 belgi bo\'lishi kerak': { en: 'Password must be at least 10 characters', ru: 'Пароль должен содержать не менее 10 символов' },
  'Parolni tiklash uchun administratorga murojaat qiling': {
    en: 'Contact the administrator to reset your password',
    ru: 'Чтобы сбросить пароль, обратитесь к администратору',
  },
  "Bu kabinetda ega yo'q": { en: 'This workspace has no owner', ru: 'У этого кабинета нет владельца' },
};

export default SAAS;
