import type { Lugat } from './index';

/**
 * RUSCHA LUG'AT.
 *
 * Kalit — o'zbekcha matnning O'ZI (sabab `index.tsx` da).
 *
 * TARJIMA QOIDALARI
 * ─────────────────
 * • Atamalar izchil: "suhbat" → диалог, "mezon" → критерий,
 *   "ball" → балл, "lid" → лид, "sotuvchi/menejer" → менеджер,
 *   "playbook" → плейбук (mahsulot atamasi, tarjima qilinmaydi).
 * • Rang va sxema nomlari (Slate, Mint, Navy…) tarjima QILINMAYDI.
 * • "Aniqlanmadi" → "Не определено": bu nol ball emas, o'lchab
 *   bo'lmaganini bildiradi.
 * • Murojaat — "вы" (kichik harf bilan): interfeys, xat emas.
 */
export const RU: Lugat = {
  // ─── Umumiy holat va harakatlar ───────────────────────────────────────────
  'Yuklanmoqda…': 'Загрузка…',
  'Yangilanmoqda…': 'Обновление…',
  'Saqlash': 'Сохранить',
  'Saqlanmoqda…': 'Сохранение…',
  'Saqlandi ✓': 'Сохранено ✓',
  'Bekor': 'Отмена',
  'Yopish': 'Закрыть',
  'Ochish': 'Открыть',
  'Ko\'rish': 'Смотреть',
  'Qo\'shish': 'Добавить',
  '+ Qo\'shish': '+ Добавить',
  'Qo\'yish': 'Задать',
  'O\'chirish': 'Отключить',
  'Olib tashlash': 'Убрать',
  'Yaratish': 'Сгенерировать',
  'Yuborish': 'Отправить',
  'Hozir yuborish': 'Отправить сейчас',
  'Qayta urinish': 'Повторить',
  'Tayyor': 'Готово',
  'Tayyor!': 'Готово!',
  'Xato': 'Ошибка',
  'Hammasi': 'Все',
  'Barchasi': 'Все',
  'Hammasi →': 'Показать все →',
  '← Orqaga': '← Назад',
  '← Dashboard': '← Дашборд',
  '← Suhbatlar': '← Диалоги',
  '← Kirishga qaytish': '← Вернуться ко входу',
  '‹ Lid xulosalari': '‹ Сводки по лидам',
  'Davom etish →': 'Продолжить →',
  'Filtrlarni tozalash': 'Сбросить фильтры',
  'Yig\'ish': 'Свернуть',
  'Uzish': 'Отключить',
  'Ulash': 'Подключить',
  'Ulangan': 'Подключено',
  'Ulanmagan': 'Не подключено',
  'Faollashtirish': 'Активировать',
  'Biriktirish': 'Привязать',
  'Havola': 'Ссылка',
  'Versiya': 'Версия',
  'Turi': 'Тип',
  'Vaqt': 'Время',
  'Sana': 'Дата',
  'Hozir': 'Сейчас',
  'Bugun': 'Сегодня',
  'Izoh': 'Заметка',
  'Matn': 'Текст',
  'Xulosa': 'Сводка',
  'Jami': 'Всего',
  'Jami:': 'Всего:',
  'O\'rtacha': 'Среднее',
  'O\'rtacha:': 'Среднее:',
  'Farq': 'Изменение',
  'Manba': 'Источник',
  'Amal': 'Действие',
  'Holat': 'Статус',
  'Rol': 'Роль',
  'Nomi': 'Название',
  'Ism': 'Имя',
  'Ismi yo\'q': 'Без имени',
  'Ismingiz': 'Ваше имя',
  'Ism familiya': 'Имя и фамилия',
  'Email': 'Email',
  'Telefon': 'Телефон',
  'Kompaniya': 'Компания',
  'Lavozim': 'Должность',
  'Muddat': 'Срок',
  'Muddat:': 'Срок:',
  'Muhlat': 'Дедлайн',
  'Yaratildi': 'Создано',
  'Yaratilgan': 'Создано',
  'Boshlanish': 'Начало',
  'Tugash': 'Конец',
  'Boshlanish sanasi': 'Дата начала',
  'Tugash sanasi': 'Дата окончания',
  'Yo\'nalish': 'Направление',
  'Bosqich': 'Этап',
  'Taqsimot': 'Распределение',

  // ─── Yon panel va banner ─────────────────────────────────────────────────
  'Menyuni ochish': 'Открыть меню',
  'Menyuni yopish': 'Закрыть меню',
  'Analitika bo\'limlari': 'Разделы аналитики',
  'Mening kabinetim': 'Мой кабинет',
  'Mening suhbatlarim': 'Мои диалоги',
  'Mening vazifalarim': 'Мои задачи',
  'To\'lov': 'Оплата',
  '— boshqarish →': '— управлять →',
  'Sinov muddati: {n} kun qoldi': 'Пробный период: осталось {n} дн.',
  'To\'lov kechikdi — {n} kundan keyin tahlil to\'xtaydi':
    'Оплата задержана — анализ остановится через {n} дн.',
  'Obuna faol emas — yangi tahlil to\'xtatilgan. Balansni to\'ldiring.':
    'Подписка неактивна — новый анализ приостановлен. Пополните баланс.',
  'asosiy': 'основной',
  '{n} ta ibora': 'фраз: {n}',
  'Til shu qurilmada almashdi, lekin hisobga saqlanmadi — boshqa qurilmada eski til qoladi.':
    'Язык сменился на этом устройстве, но не сохранился в аккаунте — на других устройствах останется прежний.',

  // ─── Navigatsiya ──────────────────────────────────────────────────────────
  'Dashboard': 'Дашборд',
  'Analitika': 'Аналитика',
  'Suhbatlar': 'Диалоги',
  'Suhbat': 'Диалог',
  'Vazifalar': 'Задачи',
  'Vazifa': 'Задача',
  'Ogohlantirishlar': 'Оповещения',
  'Ogohlantirish': 'Оповещение',
  'Kunlik hisobot': 'Ежедневный отчёт',
  'Lid xulosalari': 'Сводки по лидам',
  'Lidlar': 'Лиды',
  'Sozlamalar': 'Настройки',
  'Chiqish': 'Выйти',
  'Baholash mezonlari': 'Критерии оценки',
  'Boshqaruv paneliga o\'tish': 'Перейти в панель управления',
  'Menejer kabinetini ochish': 'Открыть кабинет менеджера',

  // ─── Analitika bo'limlari ────────────────────────────────────────────────
  'Umumiy ko\'rinish': 'Обзор',
  'Sifat nazorati': 'Контроль качества',
  'Jamoa malakasi': 'Компетенции команды',
  'Vazifalar tahlili': 'Анализ задач',
  'Mijoz tahlili': 'Анализ клиентов',
  'Faoliyat tahlili': 'Анализ активности',
  'Lid analitikasi': 'Аналитика лидов',

  // ─── Sozlamalar bo'limlari ───────────────────────────────────────────────
  'Profil': 'Профиль',
  'Ko\'rinish': 'Внешний вид',
  'Biznes': 'Бизнес',
  'Bizneslar': 'Бизнесы',
  'Rahbarlar': 'Руководители',
  'Menejerlar': 'Менеджеры',
  'Sotuvchilar': 'Менеджеры',
  'Sotuvchi': 'Менеджер',
  'Menejer': 'Менеджер',
  'Ish jadvali': 'График работы',
  'Obuna': 'Подписка',
  'Integratsiyalar': 'Интеграции',
  'Bildirishnomalar': 'Уведомления',
  'Umumiy': 'Общее',
  'AI va integratsiya': 'ИИ и интеграции',
  'Hozircha yon panel va Sozlamalar bo\'limi tarjima qilingan. Qolgan sahifalar o\'zbekcha ko\'rinadi — ular bosqichma-bosqich qo\'shilmoqda.':
    'Пока переведены боковое меню и раздел «Настройки». Остальные страницы остаются на узбекском — они добавляются постепенно.',
  'Profil, jamoa, ish jadvali va ulanishlar': 'Профиль, команда, график и подключения',

  // ─── Ko'rinish ────────────────────────────────────────────────────────────
  'Mavzu': 'Тема',
  'Til': 'Язык',
  'Interfeys tili': 'Язык интерфейса',
  'Asosiy rang': 'Основной цвет',
  'Tizim bo\'yicha': 'Системная',
  'Qurilma sozlamasiga ergashadi': 'Следует настройке устройства',
  'Yorug\'': 'Светлая',
  'Har doim yorug\' mavzu': 'Всегда светлая тема',
  'Qorong\'i': 'Тёмная',
  'Har doim qorong\'i mavzu': 'Всегда тёмная тема',
  'Ko\'rinish shu qurilmada saqlanadi va boshqa foydalanuvchilarga ta\'sir qilmaydi.':
    'Внешний вид сохраняется на этом устройстве и не влияет на других пользователей.',
  'Iliq': 'Тёплая',
  'Neytral': 'Нейтральная',
  'Qora': 'Чёрная',
  'Qizil': 'Красный',
  'Ko\'k': 'Синий',
  'Yashil': 'Зелёный',
  'Siyoh': 'Фиолетовый',
  'keyin qo\'llanadi': 'применится позже',
  'tarjima yo\'q': 'нет перевода',
  'O\'zbekcha': 'O\'zbekcha',
  'English': 'English',
  'Русский': 'Русский',

  // ─── Kirish va parol ─────────────────────────────────────────────────────
  'Kiring': 'Войти',
  'Parol': 'Пароль',
  'Joriy parol': 'Текущий пароль',
  'Yangi parol': 'Новый пароль',
  'Parolni takrorlang': 'Повторите пароль',
  'Parolni o\'zgartirish': 'Сменить пароль',
  'Parolni unutdingizmi?': 'Забыли пароль?',
  'Parollar mos kelmadi': 'Пароли не совпадают',
  'Yangi parol o\'rnating': 'Установите новый пароль',
  'Parol havolasi': 'Ссылка для пароля',
  'Ro\'yxatdan o\'ting': 'Зарегистрируйтесь',
  'Kamida 10 belgi. Uzunlik murakkablikdan muhimroq.':
    'Минимум 10 символов. Длина важнее сложности.',
  'Kamida 10 belgi. Rahbar buni ko\'radi.': 'Минимум 10 символов. Руководитель это увидит.',
  'Parol o\'zgargach boshqa barcha qurilmalardagi sessiyalar bekor qilinadi.':
    'После смены пароля сессии на всех других устройствах будут завершены.',
  'Parol o\'zgargach barcha qurilmalardagi eski sessiyalar bekor qilinadi.':
    'После смены пароля все прежние сессии на всех устройствах завершаются.',
  'Havola eskirgan bo\'lsa, kirish ekranidan yangisini so\'rang.':
    'Если ссылка устарела, запросите новую на экране входа.',
  'Telegram bog\'lanmagan bo\'lsa — rahbaringizdan tiklash havolasini so\'rang.':
    'Если Telegram не привязан, попросите ссылку для сброса у руководителя.',
  'Agar bunday hisob mavjud bo\'lsa va Telegram bog\'langan bo\'lsa, tiklash havolasi yuborildi. Havola 30 daqiqa amal qiladi.':
    'Если такой аккаунт существует и к нему привязан Telegram, ссылка для сброса отправлена. Она действует 30 минут.',

  // ─── Ball va baholash ────────────────────────────────────────────────────
  'Ball': 'Балл',
  'Yangi ball': 'Новый балл',
  'O\'rtacha ball': 'Средний балл',
  'o\'rtacha ball:': 'средний балл:',
  'Baholash': 'Оценка',
  'Baholandi': 'Оценено',
  'Baholangan': 'Оценено',
  'Baholangan kategoriyalar': 'Оценённые категории',
  'Tahlil qilingan': 'Проанализировано',
  'Tahlilda': 'В анализе',
  'Tahlil ketmoqda…': 'Идёт анализ…',
  'Mezon': 'Критерий',
  'Mezon nomi': 'Название критерия',
  'Mezonlar bo\'yicha baho': 'Оценки по критериям',
  'Mezonlar bo\'yicha jamoa': 'Команда по критериям',
  'Kuchli tomoni': 'Сильная сторона',
  'Nima yaxshi': 'Что получилось',
  'Nimani tuzatish': 'Что исправить',
  'Shunday deyish mumkin edi': 'Как можно было сказать',
  'Asosiy kamchilik:': 'Главный пробел:',
  'Zaif bosqich': 'Слабый этап',
  'Zaif holatlar': 'Слабые случаи',
  'Zaif baho qayd etilmagan': 'Слабых оценок не зафиксировано',
  'Qizil bayroq': 'Красный флаг',
  'Qizil bayroqlar': 'Красные флаги',
  'Qoidabuzarlik': 'Нарушение',
  'Bayroqlangan': 'С флагом',
  'ko\'rik talab qiladi': 'требует проверки',
  '⚑ ko\'rik kerak': '⚑ нужна проверка',
  '⚑ bayroq': '⚑ флаг',
  'Bahoga e\'tiroz': 'Оспорить оценку',
  'Bu baho noto\'g\'ri deb hisoblayman': 'Считаю эту оценку неверной',
  'Qabul qilish': 'Принять',
  'Rad etish': 'Отклонить',
  'Rad etish sababi': 'Причина отклонения',
  'Hal qilingan': 'Решено',
  'Ochiq': 'Открыто',
  'Rahbar izohi': 'Комментарий руководителя',
  'Klassifikatsiya ishonchi': 'Уверенность классификации',
  'Speaker aniqlash usuli': 'Способ определения говорящего',
  'Biznesga tegishliligi': 'Отношение к бизнесу',
  'Murojaat turi': 'Тип обращения',
  'Murojaat turlari': 'Типы обращений',
  'Xizmat yo\'nalishi': 'Направление услуги',

  // ─── Suhbat ──────────────────────────────────────────────────────────────
  'Suhbat detali': 'Детали диалога',
  'Suhbat dinamikasi': 'Динамика диалога',
  'Suhbat konteksti': 'Контекст диалога',
  'Suhbat matni': 'Транскрипт',
  'Suhbatni ochish': 'Открыть диалог',
  'suhbatni ko\'rish →': 'посмотреть диалог →',
  'Yozishma': 'Переписка',
  'Xabarlar': 'Сообщения',
  'Kanal': 'Канал',
  'Kontakt': 'Контакт',
  'Mijoz': 'Клиент',
  'Mijoz:': 'Клиент:',
  'Menejer:': 'Менеджер:',
  'Javob': 'Ответ',
  'Javob berildi': 'Отвечено',
  'Javob berilgan': 'Отвечено',
  'Javob kutmoqda': 'Ждёт ответа',
  'Javobsiz': 'Без ответа',
  'Javob tezligi': 'Скорость ответа',
  'Median javob': 'Медианный ответ',
  'Birinchi javob': 'Первый ответ',
  'Birinchi aloqa': 'Первый контакт',
  'Oxirgi aloqa': 'Последний контакт',
  'Oxirgi murojaat': 'Последнее обращение',
  'Kelishuvlar': 'Договорённости',
  'Va\'dalar:': 'Обещания:',
  'Savolnoma': 'Анкета',
  'Anketa savollari': 'Вопросы анкеты',
  'Audio yozuv': 'Аудиозапись',
  'Audio fayl': 'Аудиофайл',
  'Audio pozitsiyasi': 'Позиция аудио',
  'Bu mijoz bilan oldingi suhbatlar': 'Прошлые диалоги с этим клиентом',
  'Bu — bu mijoz bilan birinchi qayd etilgan suhbat':
    'Это первый зафиксированный диалог с этим клиентом',
  'Mijoz ma\'lumoti aniqlanmadi': 'Данные клиента не определены',
  'Isbotga bosing — yozishmadagi aynan o\'sha joy ochiladi':
    'Нажмите на цитату — откроется именно это место в переписке',
  'Har bir bahoning ortida transkriptdagi aniq iqtibos turadi — suhbatni ochib ko\'rishingiz mumkin.':
    'За каждой оценкой стоит точная цитата из транскрипта — диалог можно открыть и проверить.',
  'Iqtibos yozishmada bor-yo\'qligi tekshiriladi — ball qo\'ygan odam ham isbot keltiradi, xuddi AI kabi.':
    'Цитата проверяется по переписке — человек, ставящий балл, тоже приводит доказательство, как и ИИ.',

  // ─── Vazifalar ───────────────────────────────────────────────────────────
  'Ochiq vazifa': 'Открытая задача',
  'Ochiq vazifalar': 'Открытые задачи',
  'Ochiq vazifa yo\'q': 'Открытых задач нет',
  'Vazifa yo\'q': 'Задач нет',
  '+ Yangi vazifa': '+ Новая задача',
  'Navbatda': 'В очереди',
  'Bajarildi': 'Выполнено',
  'Bajarilish': 'Выполнение',
  'Bekor qilingan': 'Отменено',
  'Kechikkan': 'С опозданием',
  'Muddati o\'tgan': 'Просрочено',
  'Muddati o\'tdi': 'Срок истёк',
  'Qo\'lda qo\'shilgan': 'Добавлено вручную',
  'AI yaratgan': 'Создано ИИ',
  'Baholangan suhbatdan': 'Из оценённого диалога',
  'Baholanmagan suhbatdan': 'Из неоценённого диалога',
  'Vazifalar manbasi': 'Источник задач',
  'AI suhbatlardagi va\'dalardan avtomatik yaratadi':
    'ИИ создаёт их автоматически из обещаний, данных в диалогах',
  'Bu ko\'rinishda vazifa yo\'q': 'В этом представлении задач нет',

  // ─── Lidlar ──────────────────────────────────────────────────────────────
  'Lid qiymati': 'Ценность лида',
  'Bitim': 'Сделка',
  'Summa': 'Сумма',
  'Qaytish imkoniyati': 'Шанс вернуть',
  'Imkoniyat bo\'yicha': 'По потенциалу',
  'Nega to\'xtadi': 'Почему остановилось',
  'Keyingi eng yaxshi qadam': 'Лучший следующий шаг',
  'Signallar va e\'tirozlar': 'Сигналы и возражения',
  'Har bir lidning butun tarixi asosida tahlil': 'Анализ на основе всей истории каждого лида',
  'Baholangan lid yo\'q': 'Оценённых лидов нет',
  'Sabab: barchasi': 'Причина: все',
  'Holat: barchasi': 'Статус: все',
  'Sotuvchi: barchasi': 'Менеджер: все',
  'Menejer: barchasi': 'Менеджер: все',
  'Aniq e\'tiroz yoki zaif mezon qayd etilmagan':
    'Конкретных возражений или слабых критериев не зафиксировано',
  'Sovib qolgan lid yo\'q — barcha kontaktlar bilan aloqa yaqinda bo\'lgan.':
    'Остывших лидов нет — со всеми контактами связывались недавно.',
  'Sovib qolgan lidlarda zaif baho qayd etilmagan':
    'У остывших лидов слабых оценок не зафиксировано',
  'Qayta bog\'lanish kerak bo\'lgan lid yo\'q — barcha kontaktlar bilan aloqa yaqinda bo\'lgan.':
    'Лидов, требующих повторного контакта, нет — со всеми связывались недавно.',

  // ─── Davr filtrlari ──────────────────────────────────────────────────────
  '7 kun': '7 дней',
  '30 kun': '30 дней',
  '90 kun': '90 дней',
  '3 kun': '3 дня',
  '3 oy': '3 месяца',
  'Hafta': 'Неделя',
  'Oy': 'Месяц',
  'Shu kun': 'Этот день',
  'Oldingi kun': 'Предыдущий день',
  'Oldingi hafta': 'Предыдущая неделя',
  'Keyingi hafta': 'Следующая неделя',
  'Butun davr': 'Весь период',
  'Davr bo\'yicha': 'По периоду',
  'Sana bo\'yicha': 'По дате',
  'Oxirgi 30 kun': 'Последние 30 дней',
  'Oxirgi 90 kun': 'Последние 90 дней',
  'Oxirgi 6 oy': 'Последние 6 месяцев',
  'Oxirgi yil': 'Последний год',
  'Tanlangan davrda': 'За выбранный период',
  'tanlangan oraliq': 'выбранный диапазон',
  'shu davr uchun': 'за этот период',
  'Davr bajarilishi': 'Выполнение за период',
  'Davrda bajarildi': 'Выполнено за период',
  'Oldingi ish kuni bilan solishtirish': 'Сравнение с предыдущим рабочим днём',
  '1 soatgacha': 'До 1 часа',
  'ayni damda': 'прямо сейчас',
  'faqat hozir': 'только сейчас',

  // ─── Bo'sh holatlar ──────────────────────────────────────────────────────
  'Bu davrda ma\'lumot yo\'q': 'За этот период данных нет',
  'Bu davrda baholangan suhbat yo\'q': 'За этот период оценённых диалогов нет',
  'Bu davrda suhbat yo\'q': 'За этот период диалогов нет',
  'Bu davrda suhbat bo\'lmagan': 'За этот период диалогов не было',
  'Bu davrda faollik yo\'q': 'За этот период активности нет',
  'Bu davrda vazifa yo\'q': 'За этот период задач нет',
  'Bu davrda baholanmagan': 'За этот период не оценивалось',
  'Bu davrda yangi kontakt yo\'q': 'За этот период новых контактов нет',
  'Bu davrda va\'da qayd etilmagan': 'За этот период обещаний не зафиксировано',
  'Bu davrda sotuvchi bo\'yicha baho yo\'q': 'За этот период оценок по менеджерам нет',
  'Bu davrda sotuvchi faolligi yo\'q': 'За этот период активности менеджеров нет',
  'Bu davrda kontaktga bog\'langan suhbat yo\'q':
    'За этот период диалогов, привязанных к контакту, нет',
  'Bu davrda javobsiz qolib, qayta ham bog\'lanilmagan holat yo\'q.':
    'За этот период не было случаев, оставшихся без ответа и без повторного контакта.',
  'Bu kuni suhbat bo\'lmagan.': 'В этот день диалогов не было.',
  'Bu kuni sotuvchi faolligi yo\'q': 'В этот день активности менеджеров нет',
  'Bu kuni mezon bahosi yo\'q.': 'В этот день оценок по критериям нет.',
  'Bu kuni anketa javobi yig\'ilmagan.': 'В этот день ответы анкеты не собирались.',
  'Hali suhbat yo\'q. Telegram botini ulang — yozishmalar avtomatik tushadi.':
    'Диалогов пока нет. Подключите Telegram-бота — переписки будут поступать автоматически.',
  'Hali baholangan suhbat yo\'q': 'Оценённых диалогов пока нет',
  'Hali tahlil qilingan suhbat yo\'q': 'Проанализированных диалогов пока нет',
  'Hali sotuvchi qo\'shilmagan': 'Менеджеры пока не добавлены',
  'Hali tranzaksiya yo\'q': 'Транзакций пока нет',
  'Hali izoh yo\'q. AI baholaydi, siz kontekst berasiz.':
    'Комментариев пока нет. ИИ оценивает, вы добавляете контекст.',
  'Faol ogohlantirish yo\'q': 'Активных оповещений нет',
  'Faol menejer yo\'q': 'Активных менеджеров нет',
  'Suhbat yo\'q': 'Диалогов нет',
  'Muammo yo\'q': 'Проблем нет',
  'Hech qanday biznesga a\'zo emassiz': 'Вы не состоите ни в одном бизнесе',
  'Hech qachon kirmagan': 'Ни разу не входил',
  'To\'liq ball qayd etilmagan': 'Полных баллов не зафиксировано',
  'Byudjet haqida gap qayd etilmagan': 'Упоминаний бюджета не зафиксировано',
  'Dam olish kuni bo\'lishi yoki Telegram integratsiyasi ishlamagan bo\'lishi mumkin.':
    'Возможно, это был выходной или интеграция с Telegram не работала.',

  // ─── Ogohlantirishlar ────────────────────────────────────────────────────
  'Javobsiz mijoz': 'Клиент без ответа',
  'Buzilgan va\'da': 'Нарушенное обещание',
  'Inson ko\'rigi kerak': 'Нужна проверка человеком',
  'Sifat pasayishi': 'Падение качества',
  'Darhol e\'tibor talab qiladigan hodisalar': 'События, требующие внимания прямо сейчас',
  'Suhbatda playbookda belgilangan jiddiy qoida buzilgan':
    'В диалоге нарушено серьёзное правило плейбука',
  'Suhbatda jiddiy qoida buzilishi aniqlandi': 'В диалоге обнаружено серьёзное нарушение правил',
  'Mijoz yozgan, lekin menejer javob bermagan': 'Клиент написал, а менеджер не ответил',
  'Mijoz yozgan, lekin javob berilmagan': 'Клиент написал, но ответа не было',
  'Suhbatda berilgan so\'z muddatida bajarilmagan':
    'Обещание, данное в диалоге, не выполнено в срок',
  'Suhbatda berilgan so\'z bajarilmagan': 'Обещание, данное в диалоге, не выполнено',
  'AI o\'z bahosiga ishonchi past — natija tekshirilishi kerak':
    'ИИ не уверен в своей оценке — результат нужно проверить',
  'AI o\'z bahosiga ishonchi past — tekshiring': 'ИИ не уверен в своей оценке — проверьте',
  'Ko\'rsatkich sezilarli tushgan': 'Показатель заметно упал',
  'Ko\'rsatkich sezilarli tushdi': 'Показатель заметно упал',
  'Past ball ogohlantirishi': 'Оповещение о низком балле',
  'Baholangan suhbat chegaradan past chiqsa ogohlantirish yaratiladi':
    'Оповещение создаётся, когда оценённый диалог опускается ниже порога',
  'Eng kam navbat soni': 'Минимальное число реплик',
  'Qisqa yozishmalar hisobga olinmaydi — ular tabiiy ravishda past ball oladi.':
    'Короткие переписки не учитываются — они естественно получают низкий балл.',
  'Qaysi hodisa ogohlantirish yaratishini tanlang. O\'chirilgan tur bo\'yicha yangi ogohlantirish umuman yaratilmaydi — mavjudlari joyida qoladi.':
    'Выберите, какие события создают оповещения. По отключённому типу новые оповещения не создаются — существующие остаются.',
  'Ogohlantirishlar faqat ish vaqtida': 'Оповещения только в рабочее время',

  // ─── Bildirishnoma kanallari ─────────────────────────────────────────────
  'Qayerga yuborilsin': 'Куда отправлять',
  'Hodisa': 'Событие',
  'Veb': 'Веб',
  'Bot': 'Бот',
  'Guruh': 'Группа',
  'Har doim yoqiq': 'Всегда включено',
  'Ilova ichidagi ro\'yxat — har doim yoqiq': 'Список внутри приложения — всегда включён',
  'Botning shaxsiy yozishmasi': 'Личная переписка с ботом',
  'Telegram guruhi': 'Telegram-группа',
  'Telegram kanali': 'Telegram-канал',
  'Telegram manzillari': 'Адреса в Telegram',
  'Rahbarning bot bilan shaxsiy yozishmasi': 'Личная переписка руководителя с ботом',
  'Jamoa guruhi — botni guruhga qo\'shing va bitta xabar yozing':
    'Групповой чат команды — добавьте бота в группу и напишите одно сообщение',
  'E\'lonlar kanali — botni administrator qiling':
    'Канал объявлений — сделайте бота администратором',
  'Bildirishnomalar shu manzillarga boradi. Bot ko\'rgan guruh va kanallar ro\'yxatda o\'zi paydo bo\'ladi.':
    'Уведомления уходят на эти адреса. Группы и каналы, которые видел бот, появляются в списке сами.',
  'Manzil tanlanmagan ustun o\'chirilgan turadi — xabar baribir hech qayerga bormasdi. Manzillarni quyidagi kartadan sozlang.':
    'Колонка без адреса остаётся отключённой — сообщению всё равно некуда идти. Адреса задаются в карточке ниже.',
  'Chat id ni qo\'lda kiritish': 'Ввести chat id вручную',
  '— tanlanmagan —': '— не выбрано —',
  'Sinov xabari': 'Тестовое сообщение',
  'Sinov xabari yuborildi ✓': 'Тестовое сообщение отправлено ✓',
  'Sotuvchining shaxsiy Telegram hisobini rahbar biriktiradi — Menejerlar bo\'limidagi «ID biriktirish» tugmasi orqali.':
    'Личный аккаунт менеджера в Telegram привязывает руководитель — кнопкой «Привязать ID» в разделе «Менеджеры».',

  // ─── CRM eksporti ────────────────────────────────────────────────────────
  'Vazifalarni CRM\'ga yuborish': 'Отправка задач в CRM',
  'Eksport yoqilsin': 'Включить экспорт',
  'Webhook manzili': 'Адрес вебхука',
  'Imzo siri': 'Секрет подписи',
  'Sinov so\'rovi': 'Тестовый запрос',
  'Sinov so\'rovi qabul qilindi ✓': 'Тестовый запрос принят ✓',
  'Oxirgi yuborishlar': 'Последние отправки',
  'Xatolilarni qayta yuborish': 'Переотправить неудачные',
  'Qabul qiluvchi tomonda imzoni qanday tekshirish kerak':
    'Как проверить подпись на принимающей стороне',
  'Har so\'rovda ikki sarlavha keladi:': 'В каждом запросе приходят два заголовка:',
  'O\'chirilganda vazifalar faqat shu ilovada qoladi — hech qayerga yuborilmaydi.':
    'При отключении задачи остаются только в этом приложении — никуда не отправляются.',

  // ─── Ish jadvali ─────────────────────────────────────────────────────────
  'Ish kunlari': 'Рабочие дни',
  'Ish vaqti': 'Рабочее время',
  'Dushanba': 'Понедельник',
  'Seshanba': 'Вторник',
  'Chorshanba': 'Среда',
  'Payshanba': 'Четверг',
  'Juma': 'Пятница',
  'Shanba': 'Суббота',
  'Yakshanba': 'Воскресенье',
  'Tugash soati boshlanishdan keyin bo\'lishi kerak':
    'Час окончания должен быть позже часа начала',
  'Menejerlar uchun alohida jadval': 'Отдельный график для менеджеров',
  'Menejerlar jadvali': 'Графики менеджеров',
  'Biznes jadvaliga qaytarish': 'Вернуть график бизнеса',
  'Jadvali yo\'q menejer biznes jadvaliga ergashadi — biznes jadvalini o\'zgartirsangiz u ham o\'zgaradi.':
    'Менеджер без своего графика следует графику бизнеса — измените график бизнеса, изменится и его.',

  // ─── Biznes sozlamalari ──────────────────────────────────────────────────
  'Biznes sozlamalari': 'Настройки бизнеса',
  'Biznes ma\'lumotlari': 'Данные бизнеса',
  'Biznes ID': 'ID бизнеса',
  'Biznes nomi': 'Название бизнеса',
  'Slug': 'Slug',
  'Soha': 'Отрасль',
  'Sohangiz': 'Ваша отрасль',
  'Tavsif': 'Описание',
  'Valyuta': 'Валюта',
  'Vaqt zonasi': 'Часовой пояс',
  'Logotip havolasi': 'Ссылка на логотип',
  'Sozlangan': 'Настроено',
  'Sozlanmoqda': 'Настраивается',
  'Sozlash tugagan': 'Настройка завершена',
  'Bunga o\'tish': 'Перейти сюда',
  'Bu qiymatlar o\'zgarmaydi. Qo\'llab-quvvatlashga murojaat qilsangiz, biznes ID sini yuboring.':
    'Эти значения не меняются. При обращении в поддержку отправьте ID бизнеса.',
  'Bu maydon bezak emas: AI suhbatni baholashda va yangi playbook tuzishda kontekst sifatida ishlatadi.':
    'Это поле не для красоты: ИИ использует его как контекст при оценке диалогов и при создании нового плейбука.',
  'Biznes nima qiladi, kimga sotadi, qanday sotadi':
    'Чем занимается бизнес, кому и как продаёт',
  'Kunlik hisobot va "bugungi vazifalar" shu zonaga qarab hisoblanadi.':
    'Ежедневный отчёт и «задачи на сегодня» считаются по этому часовому поясу.',
  'Faol biznes tanlovi shu qurilmada saqlanadi. Barcha bo\'lim va hisobotlar tanlangan biznes bo\'yicha ko\'rsatiladi.':
    'Выбор активного бизнеса хранится на этом устройстве. Все разделы и отчёты показываются по выбранному бизнесу.',
  'Yangi biznes ochish uchun alohida hisob kerak — bitta hisobdan ikkinchi biznes yaratish hali qo\'shilmagan.':
    'Для нового бизнеса нужен отдельный аккаунт — создание второго бизнеса из одного аккаунта пока недоступно.',

  // ─── Profil ──────────────────────────────────────────────────────────────
  'Ulangan hisoblar': 'Подключённые аккаунты',
  'Kirish va parol tiklash uchun': 'Для входа и сброса пароля',
  'Telegram bot': 'Telegram-бот',
  'Suhbatlar shu bot orqali keladi': 'Диалоги поступают через этого бота',
  'Yoki tashqi havola kiriting': 'Или укажите внешнюю ссылку',
  'Bu havoladan rasm yuklanmadi — hozircha ism harflari ko\'rsatilmoqda.':
    'По этой ссылке изображение не загрузилось — пока показываются инициалы.',
  'Email o\'zgartirish yangi manzilni tasdiqlashni talab qiladi — hozircha qo\'llab quvvatlanmaydi.':
    'Смена email требует подтверждения нового адреса — пока не поддерживается.',
  'Til va mavzu': 'Язык и тема',
  'Interfeys tilini tanlang. Bu — hisob sozlamasi: qaysi qurilmadan kirsangiz ham saqlanadi.':
    'Выберите язык интерфейса. Это настройка аккаунта: она сохраняется на любом устройстве.',
  'Bosiladigan hamma narsa — tugma, faol menyu, fokus halqasi — shu rangda bo\'ladi. Ball va ogohlantirish ranglari o\'zgarmaydi: ular ma\'noni bildiradi, bezak emas.':
    'Всё кликабельное — кнопки, активный пункт меню, кольцо фокуса — будет этого цвета. Цвета баллов и оповещений не меняются: они несут смысл, а не оформление.',

  // ─── Jamoa ───────────────────────────────────────────────────────────────
  'Jamoa': 'Команда',
  'Jamoa trendi': 'Тренд команды',
  'Jamoa holati bir qarashda': 'Состояние команды с одного взгляда',
  'Kouching': 'Коучинг',
  'Faol': 'Активен',
  'Kutilmoqda': 'Ожидает',
  'O\'chirilgan': 'Отключён',
  'o\'chirilgan': 'отключён',
  'To\'xtatilgan': 'Приостановлен',
  'Faol sotuvchilar': 'Активные менеджеры',
  'Sotuvchilar reytingi': 'Рейтинг менеджеров',
  'Sotuvchi ismi': 'Имя менеджера',
  'Yangi sotuvchi': 'Новый менеджер',
  'Aktivatsiya havolasi': 'Ссылка активации',
  'Telegram ID biriktirish': 'Привязать Telegram ID',
  'ID biriktirish': 'Привязать ID',
  'Rahbar taklif qilish': 'Пригласить руководителя',
  'Taklif qilish': 'Пригласить',
  'Oxirgi kirish': 'Последний вход',
  'Menejerni ochish': 'Открыть менеджера',
  'Menejer-mezon xaritasi': 'Карта «менеджер × критерий»',
  'Kimga aynan qaysi mezonni o\'rgatish kerakligi': 'Кому какой критерий нужно подтянуть',
  'Ega rolini o\'zgartirib bo\'lmaydi — to\'lov va odamlar ustidan nazorat egada qoladi.':
    'Роль владельца изменить нельзя — оплата и управление людьми остаются за владельцем.',
  'Sizning hisobingiz sotuvchi o\'rniga bog\'lanmagan — kabinet ko\'rsatib bo\'lmaydi.':
    'Ваш аккаунт не привязан к месту менеджера — кабинет показать нельзя.',
  'Avval sotuvchi qo\'shing': 'Сначала добавьте менеджера',
  'sotuvchi biriktirilmagan': 'менеджер не привязан',

  // ─── Obuna ───────────────────────────────────────────────────────────────
  'Balans': 'Баланс',
  'Balansni to\'ldirish': 'Пополнить баланс',
  'Qoldiq': 'Остаток',
  'Oylik xarajat': 'Расход в месяц',
  'Bitta seat / oy': 'Одно место / месяц',
  'Tranzaksiyalar': 'Транзакции',
  'To\'lov va obuna': 'Оплата и подписка',
  'Sinov muddati': 'Пробный период',
  'Bepul foydalanish davri': 'Период бесплатного использования',
  'Obuna to\'langan, hammasi ishlaydi': 'Подписка оплачена, всё работает',
  'To\'lov kechikdi, lekin hammasi hali ishlayapti': 'Оплата задержана, но всё ещё работает',
  'Yangi tahlil to\'xtatildi. Ma\'lumot yig\'ish davom etadi, eski natijalar ko\'rinadi.':
    'Новый анализ приостановлен. Сбор данных продолжается, прежние результаты доступны.',
  'Seat asosida narxlash — sotuvchilar soniga qarab':
    'Оплата за места — по числу менеджеров',
  'Hozircha qo\'lda kiritiladi — bank o\'tkazmasi yoki Payme/Click orqali to\'lov qilib, summani shu yerga kiriting. Avtomatik to\'lov keyinroq ulanadi.':
    'Пока вводится вручную — оплатите банковским переводом или через Payme/Click и внесите сумму здесь. Автоматическая оплата появится позже.',

  // ─── Integratsiya ────────────────────────────────────────────────────────
  'Telegram': 'Telegram',
  'Telegram ulangan': 'Telegram подключён',
  'Bot ulangan': 'Бот подключён',
  'Bot token': 'Токен бота',
  'Bot tokeni': 'Токен бота',
  'Token': 'Токен',
  'Telegram botini ulang': 'Подключите Telegram-бота',
  'Qabul qiluvchi chat ID': 'Chat ID получателя',
  'Yuborish vaqti': 'Время отправки',
  'Oxirgi hisobotlar': 'Последние отчёты',
  'Oxirgi xato': 'Последняя ошибка',
  'Sinxron xatosi': 'Ошибка синхронизации',
  'Integratsiya ma\'lumot ololmadi': 'Интеграция не смогла получить данные',
  'Transkript modeli': 'Модель транскрипции',
  'Audio yuklashda ishlatiladigan model': 'Модель, используемая при загрузке аудио',
  'To\'liq token hech qachon qaytarilmaydi — bazada shifrlangan holda saqlanadi.':
    'Полный токен никогда не возвращается — в базе он хранится в зашифрованном виде.',
  '@BotFather orqali bot yarating va token\'ni shu yerga kiriting. Token shifrlangan holda saqlanadi.':
    'Создайте бота через @BotFather и вставьте токен сюда. Токен хранится в зашифрованном виде.',
  '@BotFather orqali bot yarating va tokenini shu yerga kiriting. Sizning yozishmalaringiz avtomatik yig\'ilib, baholanadi.':
    'Создайте бота через @BotFather и вставьте его токен сюда. Ваши переписки будут собираться и оцениваться автоматически.',
  'Guruh ID si manfiy bo\'ladi, shaxsiy chat — musbat.':
    'ID группы отрицательный, личного чата — положительный.',
  'Telegram yozishmalari endi avtomatik yig\'iladi va sizning playbook\'ingiz bo\'yicha baholanadi.':
    'Переписки Telegram теперь собираются автоматически и оцениваются по вашему плейбуку.',

  // ─── Onboarding ──────────────────────────────────────────────────────────
  'Biznesingiz haqida': 'О вашем бизнесе',
  'Onboarding qadamlari': 'Шаги настройки',
  'Sotuvchilaringizni qo\'shing': 'Добавьте своих менеджеров',
  'Keyinroq ulayman': 'Подключу позже',
  'Oxirgi qadam — webhook': 'Последний шаг — вебхук',
  'Namunalarni baholash': 'Оценить образцы',
  'Hoziroq sinab ko\'ring': 'Попробуйте прямо сейчас',
  'AI qoralamasi tayyor.': 'Черновик ИИ готов.',
  'AI natijasi — tekshiring va tasdiqlang': 'Результат ИИ — проверьте и подтвердите',
  'AI baholash mezonlarini tuzmoqda… bu 10-20 soniya oladi':
    'ИИ составляет критерии оценки… это займёт 10–20 секунд',
  '↻ Qayta generatsiya': '↻ Сгенерировать заново',
  '* bilan belgilangan maydonlar to\'ldirilishi shart': 'Поля со звёздочкой обязательны',
  'Bu ma\'lumot AI baholash mezonlarini tuzishda asos bo\'ladi. Qanchalik aniq yozsangiz, shunchalik mos playbook chiqadi.':
    'Эта информация — основа для критериев оценки ИИ. Чем точнее вы опишете, тем лучше подойдёт плейбук.',
  '3 ta namunaviy suhbatni yuklaymiz va sizning mezonlaringiz bo\'yicha baholaymiz. Bu haqiqiy tahlil — oldindan yozilgan natija emas.':
    'Мы загрузим 3 образцовых диалога и оценим их по вашим критериям. Это настоящий анализ, а не заранее подготовленный результат.',
  'Keyinroq ham qo\'shishingiz mumkin. Har birini Telegram profiliga bog\'lash sozlamalarda.':
    'Их можно добавить и позже. Привязка каждого к профилю Telegram — в настройках.',
  'Har bir suhbat playbook mezonlari bo\'yicha baholanmoqda. Bu odatda yarim daqiqa oladi.':
    'Каждый диалог оценивается по критериям плейбука. Обычно это занимает около полуминуты.',

  // ─── Playbook ────────────────────────────────────────────────────────────
  'Playbook — har suhbat shu bo\'yicha baholanadi':
    'Плейбук — по нему оценивается каждый диалог',
  'Bu mezon nimani baholaydi?': 'Что измеряет этот критерий?',
  'Savol matni': 'Текст вопроса',
  '+ Kategoriya qo\'shish': '+ Добавить категорию',
  '+ Mezon qo\'shish': '+ Добавить критерий',
  '+ Savol qo\'shish': '+ Добавить вопрос',
  'Soha lug\'ati': 'Отраслевой словарь',
  'Atama kiriting va Enter bosing': 'Введите термин и нажмите Enter',
  'Nutqni matnga aylantirishda aniqlik uchun — mahsulot nomlari, brend so\'zlari':
    'Повышает точность распознавания речи — названия продуктов, бренды',
  'Sotuvchi hech qachon qilmasligi kerak bo\'lgan narsalar':
    'То, чего менеджер не должен делать никогда',
  'Suhbatda albatta aniqlanishi kerak bo\'lgan ma\'lumot':
    'Информация, которую обязательно нужно выяснить в диалоге',
  'Xatolar topildi:': 'Найдены ошибки:',
  'Vaznlar yig\'indisi:': 'Сумма весов:',
  'Ko\'rib chiqing, kerak bo\'lsa tahrirlang — keyin qabul qiling.':
    'Просмотрите, при необходимости отредактируйте — затем примите.',

  // ─── Suhbat yuklash ──────────────────────────────────────────────────────
  '＋ Suhbat yuklash': '＋ Загрузить диалог',
  'Qo\'lda suhbat yuklash': 'Загрузить диалог вручную',
  'Namuna matnni qo\'yish': 'Вставить образец текста',
  'Matnni tahrirlash': 'Редактировать текст',
  'Matnni yozishmadan aynan nusxalang': 'Скопируйте текст из переписки как есть',
  'Avtomatik to\'g\'rilash': 'Автоисправление',
  'Tasdiqlash va matnga o\'tish': 'Подтвердить и перейти к тексту',
  'Rollar to\'g\'rimi? Noto\'g\'ri bo\'lsa tahlil ham teskari chiqadi.':
    'Роли определены верно? Если нет, анализ тоже будет неверным.',
  'MP3, WAV, OGG yoki FLAC — 10 MB gacha. M4A qo\'llab-quvvatlanmaydi. Yozuvda ikkala tomon ham eshitilishi kerak, aks holda so\'zlovchilar ajralmaydi.':
    'MP3, WAV, OGG или FLAC — до 10 МБ. M4A не поддерживается. В записи должны быть слышны обе стороны, иначе говорящих не разделить.',
  'Audio yuklanmadi. Fayl mavjud emas yoki formati qo\'llab-quvvatlanmaydi.':
    'Аудио не загрузилось. Файл отсутствует или формат не поддерживается.',
  'AI kim gapirganini va matn xatolarini tuzatishga urindi. Noto\'g\'ri joy bo\'lsa — "Matnni tahrirlash" orqali keyingi qadamda qo\'lda to\'g\'rilang.':
    'ИИ попытался определить говорящих и исправить ошибки в тексте. Если что-то не так, поправьте вручную на следующем шаге через «Редактировать текст».',
  '⚠ AI ishlamadi, oddiy kalit-so\'z qoidalari bilan taxminiy ajratildi. Bu ancha xato bo\'lishi mumkin — diqqat bilan tekshiring.':
    '⚠ ИИ не сработал, говорящие разделены простыми правилами по ключевым словам. Это может быть сильно неточно — проверьте внимательно.',
  'Bo\'sh qoldirilsa — hozirgi vaqt.': 'Если оставить пустым — текущее время.',
  'Fayl tanlandi:': 'Выбран файл:',

  // ─── Grafiklar va boshqa ─────────────────────────────────────────────────
  'G\'ildirak bilan yaqinlashtiring, sudrab suring':
    'Приближайте колесом, перетаскивайте мышью',
  'Nuqta rangi — o\'sha kungi o\'rtacha ball': 'Цвет точки — средний балл того дня',
  'Kunlik dinamika': 'Динамика по дням',
  'Faollik': 'Активность',
  'Eng yaxshi': 'Лучший',
  'Intilish kerak': 'Есть куда расти',
  'E\'tibor kerak': 'Нужно внимание',
  'Hozir ko\'proq uchraydi': 'Сейчас встречается чаще',
  'Raqamlar ortidagi sabab': 'Причина за цифрами',
  'Suhbatlar sifati': 'Качество диалогов',
  'Bir kunning to\'liq kesimi': 'Полный разрез одного дня',
  'So\'nggi suhbatlar': 'Последние диалоги',
  'So\'nggi tahlillar': 'Последние анализы',
  'Shu kunning zaif mezonlari': 'Слабые критерии этого дня',
  'Javobsiz va qayta aloqasiz': 'Без ответа и без повторного контакта',
  'Mijoz yozgan, menejer javob bermagan VA tanlangan muddat ichida o\'zi ham bog\'lanmagan holatlar.':
    'Случаи, когда клиент написал, менеджер не ответил И сам не связался в течение выбранного срока.',
  'Manbani tanlang — quyidagi barcha raqamlar shu tanlovga qarab hisoblanadi.':
    'Выберите источник — все цифры ниже считаются по этому выбору.',
  '"Jamoa" ustuni — shu davrda boshqa sotuvchilarning o\'rtachasi. "Aniqlanmadi" ballari o\'rtachaga qo\'shilmaydi.':
    'Колонка «Команда» — среднее по остальным менеджерам за период. Баллы «Не определено» в среднее не входят.',
  '"Aniqlanmadi" ballari foizga qo\'shilmaydi — ular alohida sanaladi.':
    'Баллы «Не определено» не входят в процент — они считаются отдельно.',
  'Bu davrda yetarli baho yo\'q — mezon "asosiy muammo" deb belgilanishi uchun kamida 3 marta baholangan bo\'lishi kerak.':
    'За период недостаточно оценок — чтобы отметить критерий как основную проблему, он должен быть оценён минимум 3 раза.',
  'Bu davrda yetarli baho yo\'q — prioritet uchun sotuvchida kamida 2 ta baholangan qo\'ng\'iroq bo\'lishi kerak.':
    'За период недостаточно оценок — для приоритизации у менеджера должно быть минимум 2 оценённых звонка.',
  'Bu davrda anketa javobi yig\'ilmagan. Savollarni «Baholash mezonlari» bo\'limida qo\'shishingiz mumkin.':
    'За этот период ответы анкеты не собирались. Вопросы можно добавить в разделе «Критерии оценки».',
  'Foiz 100 dan yuqori — eski davrdan qolgan vazifalar ham yopilgan.':
    'Больше 100% — закрыты и задачи, оставшиеся с прошлого периода.',
  'Zaif chiqqan mezonlar — aynan shu bosqichlarda yiqilgan:':
    'Критерии с самыми низкими оценками — именно на этих этапах всё срывалось:',

  // ─── Mijoz anketasi ──────────────────────────────────────────────────────
  'Mijoz turi': 'Тип клиента',
  'Mijozingiz kim? *': 'Кто ваш клиент? *',
  'Mijoz qanday muammo bilan keladi? *': 'С какой проблемой приходит клиент? *',
  'Biznesingiz nima bilan shug\'ullanadi? *': 'Чем занимается ваш бизнес? *',
  'Asosiy mahsulot/xizmatlaringiz *': 'Ваши основные продукты/услуги *',
  'Eng ko\'p uchraydigan e\'tirozlar *': 'Самые частые возражения *',
  'Qaror qabul qiluvchi': 'Лицо, принимающее решение',
  'qaror qiluvchi': 'принимает решение',
  'Ikkalasi ham': 'Оба',
  'Mijoz murojaati': 'Обращение клиента',
  'Aloqa o\'rnatilgan': 'Контакт установлен',
  'Suhbat bor': 'Есть диалог',
};
