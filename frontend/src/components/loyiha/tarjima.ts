import { useTil, type Til } from '../../i18n';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LANDING MATNLARI — o'zbek, rus, ingliz
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Umumiy `LUGAT` (i18n.tsx) qisqa interfeys yorliqlari uchun: kalit —
 * o'zbekcha matnning o'zi. Landing esa uzun, tuzilmali matn (qadamlar,
 * kartalar, ro'yxatlar) — uni bir-biriga bog'lanmagan kalitlarga bo'lish
 * tarjimani kuzatib bo'lmas holga keltirardi. Shuning uchun bu yerda har
 * til uchun bitta to'liq obyekt.
 *
 * `LandingMatn` tipi qat'iy: birorta tilda kalit tushib qolsa yoki ro'yxat
 * uzunligi farq qilsa (`Besh<T>` — aniq 5 ta), TypeScript build'ni to'xtatadi.
 * Ikonlar, manzillar va ruxsatlar matndan alohida — `malumot.tsx` da.
 */

type Uch<T> = [T, T, T];
type Tort<T> = [T, T, T, T];
type Besh<T> = [T, T, T, T, T];
/** Sarlavha: [oddiy qism, urg'uli (gradient) qism]. */
type Sarlavha = [string, string];

interface NomIzoh {
  nom: string;
  izoh: string;
}

interface NomMatn {
  nom: string;
  matn: string;
}

export interface QadamMatn {
  nom: string;
  qisqa: string;
  matn: string;
  bandlar: Uch<string>;
  /** Sozlanadigan joy nomi (manzili `malumot.tsx` da). Yo'q — avtomatik. */
  joy?: string;
}

export interface BolimMatn {
  nom: string;
  matn: string;
  imkonlar: string[];
}

export type BolimKalit =
  | 'bosh'
  | 'qongiroqlar'
  | 'aiChat'
  | 'analitika'
  | 'kunlik'
  | 'lidlar'
  | 'ogoh'
  | 'sozlamalar';

export interface LandingMatn {
  nav: {
    jarayon: string;
    bolimlar: string;
    boshlash: string;
    tuzilish: string;
    aria: string;
    til: string;
  };
  tugma: {
    kirish: string;
    platformaga: string;
    sozlash: string;
    qandayIshlaydi: string;
    chiqish: string;
    sozlamalar: string;
    aiChat: string;
    tepaga: string;
  };
  hero: {
    yorliq: string;
    salom: (ism: string) => string;
    sarlavha: Sarlavha;
    lead: string;
    pastga: string;
  };
  faktlar: Uch<NomIzoh>;
  xarita: {
    sarlavha: string;
    jonli: string;
    manbalar: Uch<NomIzoh>;
    natijalar: Tort<NomIzoh>;
    markaz: NomIzoh;
  };
  jarayon: {
    yorliq: string;
    sarlavha: Sarlavha;
    matn: string;
    qadam: string;
    avto: string;
    chiziqAria: string;
    qadamAria: (raqam: number, nom: string) => string;
    qadamlar: Besh<QadamMatn>;
    sahna: {
      integratsiyalar: Uch<NomIzoh & { holat: string }>;
      botIzoh: string;
      yozishma: string;
      pufaklar: Uch<string>;
      jimlik: string;
      qongiroq: string;
      stt: string;
      menejer: string;
      mijoz: string;
      transkript: [string, string];
      quvur: Tort<NomIzoh>;
      kod: string;
      iqtibos: string;
      topildi: string;
      umumiyBall: string;
      isbotlar: string;
      vazifa: NomIzoh;
      ogoh: NomIzoh;
      lid: NomIzoh;
      kouching: NomIzoh;
      halqa: Tort<string>;
      hisobot: string;
    };
  };
  bolimlar: {
    yorliq: string;
    sarlavha: Sarlavha;
    matnMehmon: string;
    matnRahbar: string;
    matnSotuvchi: string;
    rahbarUchun: string;
    royxat: Record<Exclude<BolimKalit, 'bosh'>, BolimMatn>;
    bosh: { nom: string; rahbar: Omit<BolimMatn, 'nom'>; sotuvchi: Omit<BolimMatn, 'nom'> };
  };
  boshlash: {
    yorliq: string;
    sarlavhaRahbar: Sarlavha;
    sarlavhaSotuvchi: Sarlavha;
    matnRahbar: string;
    matnSotuvchi: string;
    ixtiyoriy: string;
    rahbar: Besh<NomMatn & { tugma: string }>;
    sotuvchi: Besh<NomMatn & { tugma: string }>;
  };
  tuzilish: {
    yorliq: string;
    sarlavha: Sarlavha;
    matn: string;
    oqim: NomIzoh;
    qatlamlar: Besh<NomIzoh & { qismlar: Uch<string> }>;
    rollar: NomIzoh;
    rolRoyxat: Besh<NomMatn>;
    rolEslatma: string;
    tamoyillar: Besh<NomMatn>;
  };
  yakun: {
    sarlavha: Sarlavha;
    mehmon: string;
    sozlanmagan: string;
    oddiy: string;
  };
  pastki: string;
}

// ─── O'zbekcha ────────────────────────────────────────────────────────────────

const UZ: LandingMatn = {
  nav: {
    jarayon: 'Jarayon',
    bolimlar: "Bo'limlar",
    boshlash: 'Boshlash',
    tuzilish: 'Tuzilish',
    aria: "Sahifa bo'limlari",
    til: 'Interfeys tili',
  },
  tugma: {
    kirish: 'Kirish',
    platformaga: "Platformaga o'tish",
    sozlash: 'Sozlashni boshlash',
    qandayIshlaydi: 'Qanday ishlaydi',
    chiqish: 'Chiqish',
    sozlamalar: 'Sozlamalar',
    aiChat: 'AI Chat',
    tepaga: 'Yuqoriga qaytish',
  },
  hero: {
    yorliq: 'Loyiha haqida',
    salom: (ism) => `Xush kelibsiz, ${ism}!`,
    sarlavha: ['Sotuvni taxmin emas —', 'isbot boshqaradi.'],
    lead:
      "SotuvAI sotuv bo'limingizning Telegram yozishmalari va qo'ng'iroqlarini kompaniyangizning o'z skripti bo'yicha baholaydi, har bir ballni suhbatdagi aniq iqtibos bilan tasdiqlaydi va har bir sotuvchiga o'sish uchun aniq tavsiya beradi.",
    pastga: 'Pastga aylantiring',
  },
  faktlar: [
    { nom: 'Isbotli baholash', izoh: 'har ball — iqtibos bilan' },
    { nom: 'Sizning skriptingiz', izoh: 'umumiy shablon emas' },
    { nom: '3 til', izoh: "o'zbek · rus · ingliz" },
  ],
  xarita: {
    sarlavha: "Ma'lumot oqimi",
    jonli: 'jonli',
    manbalar: [
      { nom: 'Telegram', izoh: 'yozishmalar' },
      { nom: "Qo'ng'iroqlar", izoh: 'Moi Zvonki' },
      { nom: 'Yuklash', izoh: 'audio · matn' },
    ],
    natijalar: [
      { nom: 'Isbotli ball', izoh: 'iqtibos bilan' },
      { nom: 'Vazifa', izoh: "va'dadan" },
      { nom: 'Ogohlantirish', izoh: 'xavfli holat' },
      { nom: 'Kouching', izoh: 'aniq tavsiya' },
    ],
    markaz: { nom: 'AI tahlil', izoh: "sizning skriptingiz bo'yicha" },
  },
  jarayon: {
    yorliq: 'Jarayon',
    sarlavha: ['Suhbatdan kouchinggacha —', 'besh qadam.'],
    matn: "Aylantiring: o'ngdagi sahna har qadamda nima bo'layotganini ko'rsatadi. Qadam raqamini bosib, istalganiga o'tish mumkin.",
    qadam: 'Qadam',
    avto: 'Avtomatik — sozlash shart emas',
    chiziqAria: 'Jarayon qadamlari',
    qadamAria: (raqam, nom) => `${raqam}-qadam: ${nom}`,
    qadamlar: [
      {
        nom: 'Kanallarni ulash',
        qisqa: 'Ulanish',
        matn:
          "Telegram bot va telefoniya bir marta ulanadi — keyin suhbatlar o'zi kelib tushadi. Bot faqat o'zi qo'shilgan joyni ko'radi, sotuvchining shaxsiy yozishmalariga kirmaydi.",
        bandlar: [
          'Telegram Bot API — guruh va shaxsiy chatlar',
          "Moi Zvonki — qo'ng'iroq yozuvlari avtomatik",
          "Qo'lda yuklash — audio yoki matnni sinab ko'rish uchun",
        ],
        joy: 'Sozlamalar → Telegram bot',
      },
      {
        nom: "Suhbatlarni yig'ish",
        qisqa: "Yig'ish",
        matn:
          "Xabarlar suhbat sessiyasiga yig'iladi. Mijoz 20 daqiqa jim tursa, suhbat yakunlangan deb tahlilga yuboriladi. Qo'ng'iroq audiosi avval matnga aylantiriladi.",
        bandlar: [
          "Yangi xabar kelsa — suhbat to'liq holda qayta baholanadi",
          'Audio → matn: lokal Whisper yoki bulutli STT',
          "So'zlovchilar (menejer / mijoz) ajratiladi",
        ],
        joy: 'Sozlamalar → Nutqni matnga',
      },
      {
        nom: 'Isbotli tahlil',
        qisqa: 'Tahlil',
        matn:
          "AI suhbatni sizning skriptingiz bo'yicha baholaydi. Har bir ball transkriptdan olingan iqtibos bilan beriladi — va bu iqtibos haqiqatan borligini KOD tekshiradi, model emas.",
        bandlar: [
          "Pre-filter: tahlilga arzimaydigan suhbatlar LLM'siz saralanadi",
          "Ekstraksiya: faktlar, va'dalar, e'tirozlar",
          'Iqtibos topilmasa — ball "aniqlanmadi", tahlil ko\'rikka bayroqlanadi',
        ],
        joy: 'Sozlamalar → Baholash mezonlari',
      },
      {
        nom: 'Natija va harakat',
        qisqa: 'Natija',
        matn:
          "Tahlil o'zi qiymat bermaydi — harakat beradi. Menejerning va'dalari muddatli vazifaga, xavfli holatlar esa ogohlantirishga aylanadi.",
        bandlar: [
          '"Ertaga qo\'ng\'iroq qilaman" → muddatli vazifa',
          "Qizil bayroq, javobsiz mijoz, muddati o'tgan va'da",
          'Lid sifati: issiq, iliq, sovuq — AI xulosasi bilan',
        ],
      },
      {
        nom: "Kouching va o'sish",
        qisqa: 'Kouching',
        matn:
          "Sotuvchi o'z balini jamoa o'rtachasi bilan yonma-yon ko'radi. Rozi bo'lmasa — e'tiroz bildiradi, rahbar hal qiladi va izoh qoldiradi. Halqa yopiladi.",
        bandlar: [
          "Har mezonda o'z bali va jamoa o'rtachasi",
          "E'tiroz → rahbar qarori → izoh sotuvchiga yetadi",
          "Kunlik hisobot belgilangan soatda Telegram'ga",
        ],
        joy: 'Sozlamalar → Kunlik hisobot',
      },
    ],
    sahna: {
      integratsiyalar: [
        { nom: 'Telegram bot', izoh: 'Sotuv guruhlari va chatlar', holat: 'Ulangan' },
        { nom: 'Moi Zvonki', izoh: "Qo'ng'iroq yozuvlari", holat: 'Ulangan' },
        { nom: "Qo'lda yuklash", izoh: 'Audio yoki matn fayl', holat: 'Tayyor' },
      ],
      botIzoh: "Bot faqat o'zi qo'shilgan chatlarni ko'radi — shaxsiy yozishmalar yopiq.",
      yozishma: 'Yozishma',
      pufaklar: ['Kurs narxi qancha?', 'Avval maqsadingizni bilsam — ishga kirish uchunmi?', 'Ha, ishga.'],
      jimlik: '20 daqiqa jimlik → tahlilga',
      qongiroq: "Qo'ng'iroq",
      stt: 'nutq → matn',
      menejer: 'Menejer',
      mijoz: 'Mijoz',
      transkript: ["Assalomu alaykum, kurs bo'yicha qo'ng'iroq qilyapman…", 'Ha, eshitaman. Narxini bilmoqchi edim.'],
      quvur: [
        { nom: 'Pre-filter', izoh: 'Arzimas suhbatlar saralanadi' },
        { nom: 'Ekstraksiya', izoh: "Faktlar, va'dalar, e'tirozlar" },
        { nom: 'Isbotli baholash', izoh: 'Har mezon — iqtibos bilan' },
        { nom: 'Isbot tekshiruvi', izoh: 'Iqtibos transkriptda bormi?' },
      ],
      kod: 'kod',
      iqtibos: "«Bo'lib to'lash imkoni bor»",
      topildi: 'transkriptda topildi',
      umumiyBall: 'Umumiy ball',
      isbotlar: '3 ta isbot · namuna',
      vazifa: { nom: 'Vazifa · avtomatik', izoh: "Ertaga 15:00 — qayta qo'ng'iroq" },
      ogoh: { nom: 'Ogohlantirish', izoh: 'Javobsiz mijoz — 2 soat' },
      lid: { nom: 'Lid sifati', izoh: 'Issiq lid · tez javob kerak' },
      kouching: { nom: 'Kouching', izoh: 'halqasi' },
      halqa: ['AI baholaydi', "Sotuvchi ko'radi", "E'tiroz", 'Rahbar izohi'],
      hisobot: "Kunlik hisobot belgilangan soatda Telegram'ga yuboriladi",
    },
  },
  bolimlar: {
    yorliq: "Platforma bo'limlari",
    sarlavha: ['Har bir ekran —', 'bitta savolga javob.'],
    matnMehmon: "Platformaning asosiy bo'limlari — har biri bitta aniq vazifa uchun.",
    matnRahbar: "Rahbar sifatida sizga ko'rinadigan bo'limlar. Kartani bosing — bo'lim ochiladi.",
    matnSotuvchi: "Sizga ko'rinadigan bo'limlar. Kartani bosing — bo'lim ochiladi.",
    rahbarUchun: 'Rahbar uchun',
    bosh: {
      nom: 'Bosh sahifa',
      rahbar: {
        matn: "30 soniyada jamoa holatini tushunish uchun: puls, sifat, kim qachon ishlayapti va nima e'tibor talab qiladi.",
        imkonlar: ["Asosiy ko'rsatkichlar va trendlar", 'Faollik issiqlik xaritasi', 'Sotuvchilar reytingi'],
      },
      sotuvchi: {
        matn: "Sizning shaxsiy kabinetingiz — nazorat emas, o'sish vositasi. Har mezonda o'z balingiz va jamoa o'rtachasi.",
        imkonlar: ['Eng zaif joyingiz va tavsiya', 'Rahbar izohlari', "E'tirozlaringiz holati"],
      },
    },
    royxat: {
      qongiroqlar: {
        nom: "Qo'ng'iroqlar",
        matn: "Barcha qo'ng'iroq va suhbatlar bitta ro'yxatda — transkript, ball va isbotlari bilan.",
        imkonlar: ["Holat, sana, menejer bo'yicha filtr", "Ballga bosib — iqtibosni ko'rish", 'Filtrlar havolada saqlanadi'],
      },
      aiChat: {
        nom: 'AI Chat',
        matn: "Jamoa ma'lumotlari bo'yicha yordamchi: savolni oddiy tilda bering, javobni raqamlar bilan oling.",
        imkonlar: ['Tayyor savol kartochkalari', 'Suhbatlar tarixi saqlanadi'],
      },
      analitika: {
        nom: 'Analitika',
        matn: 'Bir davr — bir necha nuqtai nazar: sifat nazorati, jamoa malakasi, vazifalar va mijozlar tahlili.',
        imkonlar: ['Kun, hafta, oy kesimida', "Qaysi mezonda jamoa yo'qotyapti", 'Havolani ulashish mumkin'],
      },
      kunlik: {
        nom: 'Kunlik hisobot',
        matn: "Kun, hafta yoki oy bo'yicha jamoa hisoboti — Telegram'ga yuborilgan asl matn bilan birga.",
        imkonlar: ['Oldingi davr bilan taqqoslash', "Telegram'ga avtomatik yuborish"],
      },
      lidlar: {
        nom: 'Lid xulosalari',
        matn: 'Har bir tahlil qilingan suhbatdan mijoz haqida qisqa xulosa: lid sifati, eng zaif joy va ball.',
        imkonlar: ['Issiq · iliq · sovuq', 'AI xulosasi va tavsiya'],
      },
      ogoh: {
        nom: 'Ogohlantirishlar',
        matn: "Darhol e'tibor talab qiladigan hodisalar — tizim o'zi yaratadi, takrorlamaydi.",
        imkonlar: ['Qizil bayroq, javobsiz mijoz', "Yangi → o'qilgan → yopilgan"],
      },
      sozlamalar: {
        nom: 'Sozlamalar',
        matn: 'Platformani biznesingizga moslash: mezonlar, jamoa, integratsiyalar, ish jadvali va bildirishnomalar.',
        imkonlar: ['Baholash mezonlari va anketa', 'Menejerlar va rahbarlar', 'Telegram bot, Moi Zvonki'],
      },
    },
  },
  boshlash: {
    yorliq: 'Ishni boshlash',
    sarlavhaRahbar: ['Birinchi natijagacha —', 'besh qadam.'],
    sarlavhaSotuvchi: ['Platformadan', "to'liq foydalaning."],
    matnRahbar:
      "Tartib bilan bajaring: kanal ulangan zahoti suhbatlar yig'ila boshlaydi, mezonlar esa ular qanday baholanishini belgilaydi.",
    matnSotuvchi: 'Besh odat — va tizim siz uchun nazorat emas, shaxsiy murabbiyga aylanadi.',
    ixtiyoriy: 'Ixtiyoriy',
    rahbar: [
      {
        nom: 'Telegram botni ulang',
        matn: "Botni sotuv guruhlariga qo'shing — yozishmalar shu paytdan boshlab yig'iladi.",
        tugma: 'Botni ulash',
      },
      {
        nom: "Qo'ng'iroqlarni ulang",
        matn: "Moi Zvonki hisobini bog'lang — yozuvlar matnga aylanib, xuddi yozishmadek baholanadi.",
        tugma: 'Moi Zvonki',
      },
      {
        nom: "Jamoani qo'shing",
        matn: "Har bir menejerga login beriladi — u aktivatsiya havolasi orqali o'z parolini qo'yadi.",
        tugma: 'Menejerlar',
      },
      {
        nom: 'Skriptingizni kiriting',
        matn: "Baholash mezonlari va vaznlari — sizning sotuv skriptingiz. O'zgartirish yangi versiya bo'ladi, o'tgan ballar buzilmaydi.",
        tugma: 'Mezonlar',
      },
      {
        nom: 'Natijani kuzating',
        matn: "Bosh sahifa va Analitikada jamoa holati, ogohlantirishlarda esa darhol e'tibor kerak bo'lgan suhbatlar.",
        tugma: 'Analitika',
      },
    ],
    sotuvchi: [
      {
        nom: "Kabinetingizni ko'ring",
        matn: "Har mezonda o'z balingiz va jamoa o'rtachasi — qayerda o'sish kerakligi darhol ko'rinadi.",
        tugma: 'Kabinet',
      },
      {
        nom: 'Isbotni oching',
        matn: 'Suhbat tafsilotida ballga bosing — u qaysi xabarga asoslangani yozishmada belgilanadi.',
        tugma: "Qo'ng'iroqlar",
      },
      {
        nom: "Rozi bo'lmasangiz — e'tiroz",
        matn: "Har bir mezon bo'yicha e'tiroz bildirish mumkin. Rahbar hal qiladi va izoh qoldiradi.",
        tugma: 'Suhbatlar',
      },
      {
        nom: "Va'dalaringizni bajaring",
        matn: "Mijozga bergan va'dalaringiz avtomatik muddatli vazifaga aylanadi — hech biri unutilmaydi.",
        tugma: 'Vazifalar',
      },
      {
        nom: "AI dan so'rang",
        matn: "Natijalaringiz bo'yicha savolni oddiy tilda bering — AI Chat javob beradi.",
        tugma: 'AI Chat',
      },
    ],
  },
  tuzilish: {
    yorliq: 'Tuzilish',
    sarlavha: ['Ishonch dizayndan emas —', 'arxitekturadan.'],
    matn: "Ma'lumot manbadan interfeysgacha qanday oqadi va qaysi qoidalar hech qachon buzilmaydi.",
    oqim: { nom: "Ma'lumot oqimi", izoh: 'manbadan interfeysgacha' },
    qatlamlar: [
      { nom: 'Manbalar', izoh: 'Suhbatlar qayerdan keladi', qismlar: ['Telegram Bot API', 'Moi Zvonki', "Qo'lda yuklash"] },
      { nom: 'Backend', izoh: 'Qabul, navbat, worker', qismlar: ['Fastify 5 · Node 22', "Navbat Postgres'da", 'Retry + DLQ'] },
      {
        nom: 'AI qatlam',
        izoh: 'Provayderdan mustaqil',
        qismlar: ["Anthropic · OpenAI-uyg'un", 'Zaxira zanjiri', 'STT: Whisper / GigaAM'],
      },
      { nom: "Ma'lumotlar", izoh: "Bitta baza, qat'iy chegaralar", qismlar: ['PostgreSQL 16', 'Drizzle ORM', 'Row Level Security'] },
      { nom: 'Interfeys', izoh: 'Siz hozir turgan joy', qismlar: ['React 18 · Vite', 'TypeScript', "O'zbek · Rus · Ingliz"] },
    ],
    rollar: { nom: 'Rollar va ruxsatlar', izoh: "har kim faqat o'z doirasini ko'radi" },
    rolRoyxat: [
      { nom: 'Ega', matn: 'Hamma narsa, jumladan obuna va rahbarlarni boshqarish' },
      { nom: 'Rahbar', matn: "Jamoa analitikasi, mezonlar, e'tirozlarni hal qilish" },
      { nom: "Bo'lim boshlig'i", matn: "O'z bo'limi menejerlari va ularning natijalari" },
      { nom: 'Auditor', matn: "Ko'rish huquqi — sifat nazorati uchun" },
      { nom: 'Menejer', matn: "O'z kabineti, suhbatlari, vazifalari va e'tirozlari" },
    ],
    rolEslatma: 'Chegara serverda tekshiriladi — interfeys faqat keraksiz tugmalarni yashiradi.',
    tamoyillar: [
      {
        nom: "Isbotsiz ball yo'q",
        matn: "Bu kelishuv emas — ma'lumotlar bazasi darajasidagi kafolat. Iqtibossiz ballni baza qabul qilmaydi.",
      },
      {
        nom: 'Tenant izolyatsiyasi',
        matn: "Har bir biznes ma'lumoti Row Level Security bilan ajratilgan: kodda filtr unutilsa ham baza begona qatorni qaytarmaydi.",
      },
      {
        nom: 'Playbook versiyalanadi',
        matn: "Mezon joyida tahrirlanmaydi — har o'zgarish yangi versiya. O'tgan oyning ballari bugungi mezon bilan qayta izohlanmaydi.",
      },
      {
        nom: 'Xavfsiz kirish',
        matn: "Parollar argon2id bilan, sessiya httpOnly cookie'da. Token o'g'irlansa — barcha sessiyalar darhol bekor qilinadi.",
      },
      {
        nom: 'Qoidani kod hisoblaydi',
        matn: "Vaznlar va aniq qoidali hisob-kitob deterministik kodda. Model faqat mazmun beradi — raqamni o'ylab topmaydi.",
      },
    ],
  },
  yakun: {
    sarlavha: ['Hammasi tayyor —', 'boshlaymizmi?'],
    mehmon: 'Hisobingizga kiring — jamoangiz suhbatlari isbot bilan baholana boshlaydi.',
    sozlanmagan: 'Bir necha daqiqalik sozlash sehrgari biznesingizni platformaga moslaydi.',
    oddiy: "Platformaga o'ting yoki savolingiz bo'lsa — AI Chat yordam beradi.",
  },
  pastki: "Sotuv bo'limi uchun isbotli AI tahlil va kouching",
};

// ─── Русский ──────────────────────────────────────────────────────────────────

const RU: LandingMatn = {
  nav: {
    jarayon: 'Процесс',
    bolimlar: 'Разделы',
    boshlash: 'Старт',
    tuzilish: 'Архитектура',
    aria: 'Разделы страницы',
    til: 'Язык интерфейса',
  },
  tugma: {
    kirish: 'Войти',
    platformaga: 'Перейти в платформу',
    sozlash: 'Начать настройку',
    qandayIshlaydi: 'Как это работает',
    chiqish: 'Выйти',
    sozlamalar: 'Настройки',
    aiChat: 'AI Чат',
    tepaga: 'Наверх',
  },
  hero: {
    yorliq: 'О проекте',
    salom: (ism) => `Добро пожаловать, ${ism}!`,
    sarlavha: ['Не догадки —', 'а доказательства.'],
    lead:
      'SotuvAI оценивает переписку в Telegram и звонки вашего отдела продаж по собственному скрипту компании, подтверждает каждый балл точной цитатой из разговора и даёт каждому менеджеру конкретные рекомендации для роста.',
    pastga: 'Прокрутите вниз',
  },
  faktlar: [
    { nom: 'Доказательная оценка', izoh: 'каждый балл — с цитатой' },
    { nom: 'Ваш скрипт', izoh: 'а не общий шаблон' },
    { nom: '3 языка', izoh: 'узб. · рус. · англ.' },
  ],
  xarita: {
    sarlavha: 'Поток данных',
    jonli: 'онлайн',
    manbalar: [
      { nom: 'Telegram', izoh: 'переписка' },
      { nom: 'Звонки', izoh: 'Moi Zvonki' },
      { nom: 'Загрузка', izoh: 'аудио · текст' },
    ],
    natijalar: [
      { nom: 'Балл', izoh: 'с цитатой' },
      { nom: 'Задача', izoh: 'из обещания' },
      { nom: 'Оповещение', izoh: 'риск сделки' },
      { nom: 'Коучинг', izoh: 'точный совет' },
    ],
    markaz: { nom: 'AI-анализ', izoh: 'по вашему скрипту' },
  },
  jarayon: {
    yorliq: 'Процесс',
    sarlavha: ['От разговора до коучинга —', 'пять шагов.'],
    matn: 'Прокручивайте: сцена справа показывает, что происходит на каждом шаге. Нажмите на номер шага, чтобы перейти к нему.',
    qadam: 'Шаг',
    avto: 'Автоматически — настраивать не нужно',
    chiziqAria: 'Шаги процесса',
    qadamAria: (raqam, nom) => `Шаг ${raqam}: ${nom}`,
    qadamlar: [
      {
        nom: 'Подключение каналов',
        qisqa: 'Подключение',
        matn:
          'Telegram-бот и телефония подключаются один раз — дальше разговоры поступают сами. Бот видит только чаты, в которые его добавили, и не имеет доступа к личной переписке менеджера.',
        bandlar: [
          'Telegram Bot API — групповые и личные чаты',
          'Moi Zvonki — записи звонков автоматически',
          'Ручная загрузка — аудио или текст для проверки',
        ],
        joy: 'Настройки → Telegram-бот',
      },
      {
        nom: 'Сбор разговоров',
        qisqa: 'Сбор',
        matn:
          'Сообщения собираются в сессию разговора. Если клиент молчит 20 минут, разговор считается завершённым и уходит на анализ. Аудио звонка сначала превращается в текст.',
        bandlar: [
          'Новое сообщение — и разговор переоценивается целиком',
          'Аудио → текст: локальный Whisper или облачный STT',
          'Реплики разделяются по ролям (менеджер / клиент)',
        ],
        joy: 'Настройки → Речь в текст',
      },
      {
        nom: 'Доказательный анализ',
        qisqa: 'Анализ',
        matn:
          'AI оценивает разговор по вашему скрипту. Каждый балл выставляется с цитатой из транскрипта — а то, что цитата действительно существует, проверяет КОД, а не модель.',
        bandlar: [
          'Пре-фильтр: пустые разговоры отсеиваются без LLM',
          'Извлечение: факты, обещания, возражения',
          'Цитата не найдена — балл «не определён», анализ уходит на проверку',
        ],
        joy: 'Настройки → Критерии оценки',
      },
      {
        nom: 'Результат и действие',
        qisqa: 'Результат',
        matn:
          'Сам по себе анализ ценности не несёт — ценность в действии. Обещания менеджера превращаются в задачи со сроком, а рискованные ситуации — в оповещения.',
        bandlar: [
          '«Завтра перезвоню» → задача со сроком',
          'Красный флаг, клиент без ответа, просроченное обещание',
          'Качество лида: горячий, тёплый, холодный — с выводом AI',
        ],
      },
      {
        nom: 'Коучинг и рост',
        qisqa: 'Коучинг',
        matn:
          'Менеджер видит свой балл рядом со средним по команде. Не согласен — подаёт возражение, руководитель принимает решение и оставляет комментарий. Цикл замыкается.',
        bandlar: [
          'По каждому критерию — свой балл и среднее по команде',
          'Возражение → решение руководителя → комментарий менеджеру',
          'Ежедневный отчёт в Telegram в заданный час',
        ],
        joy: 'Настройки → Ежедневный отчёт',
      },
    ],
    sahna: {
      integratsiyalar: [
        { nom: 'Telegram-бот', izoh: 'Группы продаж и чаты', holat: 'Подключён' },
        { nom: 'Moi Zvonki', izoh: 'Записи звонков', holat: 'Подключён' },
        { nom: 'Ручная загрузка', izoh: 'Аудио или текстовый файл', holat: 'Готово' },
      ],
      botIzoh: 'Бот видит только чаты, куда его добавили, — личная переписка закрыта.',
      yozishma: 'Переписка',
      pufaklar: ['Сколько стоит курс?', 'Сначала уточню вашу цель — для трудоустройства?', 'Да, для работы.'],
      jimlik: '20 минут тишины → на анализ',
      qongiroq: 'Звонок',
      stt: 'речь → текст',
      menejer: 'Менеджер',
      mijoz: 'Клиент',
      transkript: ['Здравствуйте, звоню по поводу курса…', 'Да, слушаю. Хотел узнать цену.'],
      quvur: [
        { nom: 'Пре-фильтр', izoh: 'Отсев пустых разговоров' },
        { nom: 'Извлечение', izoh: 'Факты, обещания, возражения' },
        { nom: 'Оценка с доказательством', izoh: 'Каждый критерий — с цитатой' },
        { nom: 'Проверка цитаты', izoh: 'Есть ли она в транскрипте?' },
      ],
      kod: 'код',
      iqtibos: '«Есть возможность рассрочки»',
      topildi: 'найдено в транскрипте',
      umumiyBall: 'Общий балл',
      isbotlar: '3 доказательства · пример',
      vazifa: { nom: 'Задача · автоматически', izoh: 'Завтра 15:00 — перезвонить' },
      ogoh: { nom: 'Оповещение', izoh: 'Клиент без ответа — 2 часа' },
      lid: { nom: 'Качество лида', izoh: 'Горячий лид · нужен быстрый ответ' },
      kouching: { nom: 'Коучинг', izoh: 'цикл' },
      halqa: ['AI оценивает', 'Менеджер видит', 'Возражение', 'Комментарий'],
      hisobot: 'Ежедневный отчёт отправляется в Telegram в заданное время',
    },
  },
  bolimlar: {
    yorliq: 'Разделы платформы',
    sarlavha: ['Каждый экран —', 'ответ на один вопрос.'],
    matnMehmon: 'Основные разделы платформы — у каждого своя чёткая задача.',
    matnRahbar: 'Разделы, доступные вам как руководителю. Нажмите на карточку, чтобы открыть раздел.',
    matnSotuvchi: 'Доступные вам разделы. Нажмите на карточку, чтобы открыть раздел.',
    rahbarUchun: 'Для руководителя',
    bosh: {
      nom: 'Главная',
      rahbar: {
        matn: 'Чтобы за 30 секунд понять состояние команды: пульс, качество, кто и когда работает и что требует внимания.',
        imkonlar: ['Ключевые показатели и тренды', 'Тепловая карта активности', 'Рейтинг менеджеров'],
      },
      sotuvchi: {
        matn: 'Ваш личный кабинет — инструмент роста, а не контроля. По каждому критерию — ваш балл и среднее по команде.',
        imkonlar: ['Ваше слабое место и рекомендация', 'Комментарии руководителя', 'Статус ваших возражений'],
      },
    },
    royxat: {
      qongiroqlar: {
        nom: 'Звонки',
        matn: 'Все звонки и переписки в одном списке — с транскриптом, баллом и доказательствами.',
        imkonlar: ['Фильтр по статусу, дате, менеджеру', 'Нажмите на балл — увидите цитату', 'Фильтры сохраняются в ссылке'],
      },
      aiChat: {
        nom: 'AI Чат',
        matn: 'Помощник по данным команды: задайте вопрос простыми словами — получите ответ с цифрами.',
        imkonlar: ['Готовые карточки вопросов', 'История чатов сохраняется'],
      },
      analitika: {
        nom: 'Аналитика',
        matn: 'Один период — несколько ракурсов: контроль качества, развитие команды, анализ задач и клиентов.',
        imkonlar: ['По дням, неделям, месяцам', 'Где команда теряет баллы', 'Ссылкой можно поделиться'],
      },
      kunlik: {
        nom: 'Ежедневный отчёт',
        matn: 'Отчёт по команде за день, неделю или месяц — вместе с исходным текстом, отправленным в Telegram.',
        imkonlar: ['Сравнение с прошлым периодом', 'Автоотправка в Telegram'],
      },
      lidlar: {
        nom: 'Сводки по лидам',
        matn: 'Краткая сводка о клиенте по каждому проанализированному разговору: качество лида, слабое место и балл.',
        imkonlar: ['Горячий · тёплый · холодный', 'Вывод и рекомендация AI'],
      },
      ogoh: {
        nom: 'Уведомления',
        matn: 'События, требующие немедленного внимания, — система создаёт их сама и не дублирует.',
        imkonlar: ['Красный флаг, клиент без ответа', 'Новое → прочитано → закрыто'],
      },
      sozlamalar: {
        nom: 'Настройки',
        matn: 'Адаптация платформы под ваш бизнес: критерии, команда, интеграции, график работы и уведомления.',
        imkonlar: ['Критерии оценки и анкета', 'Менеджеры и руководители', 'Telegram-бот, Moi Zvonki'],
      },
    },
  },
  boshlash: {
    yorliq: 'Начало работы',
    sarlavhaRahbar: ['До первого результата —', 'пять шагов.'],
    sarlavhaSotuvchi: ['Используйте платформу', 'на полную.'],
    matnRahbar:
      'Выполняйте по порядку: как только канал подключён, разговоры начинают собираться, а критерии определяют, как они будут оценены.',
    matnSotuvchi: 'Пять привычек — и система станет для вас не контролёром, а личным наставником.',
    ixtiyoriy: 'Необязательно',
    rahbar: [
      {
        nom: 'Подключите Telegram-бота',
        matn: 'Добавьте бота в группы продаж — переписка начнёт собираться с этого момента.',
        tugma: 'Подключить бота',
      },
      {
        nom: 'Подключите звонки',
        matn: 'Привяжите аккаунт Moi Zvonki — записи превратятся в текст и будут оцениваться так же, как переписка.',
        tugma: 'Moi Zvonki',
      },
      {
        nom: 'Добавьте команду',
        matn: 'Каждому менеджеру выдаётся логин — свой пароль он задаёт по ссылке активации.',
        tugma: 'Менеджеры',
      },
      {
        nom: 'Внесите свой скрипт',
        matn: 'Критерии оценки и их веса — это ваш скрипт продаж. Изменение создаёт новую версию, прошлые баллы не искажаются.',
        tugma: 'Критерии',
      },
      {
        nom: 'Следите за результатом',
        matn: 'Состояние команды — на главной и в аналитике, а разговоры, требующие внимания, — в уведомлениях.',
        tugma: 'Аналитика',
      },
    ],
    sotuvchi: [
      {
        nom: 'Откройте свой кабинет',
        matn: 'По каждому критерию — ваш балл и среднее по команде: сразу видно, где расти.',
        tugma: 'Кабинет',
      },
      {
        nom: 'Откройте доказательство',
        matn: 'В карточке разговора нажмите на балл — сообщение, на котором он основан, подсветится в переписке.',
        tugma: 'Звонки',
      },
      {
        nom: 'Не согласны — возразите',
        matn: 'По любому критерию можно подать возражение. Руководитель примет решение и оставит комментарий.',
        tugma: 'Разговоры',
      },
      {
        nom: 'Выполняйте обещания',
        matn: 'Обещания клиентам автоматически превращаются в задачи со сроком — ни одно не забудется.',
        tugma: 'Задачи',
      },
      {
        nom: 'Спросите AI',
        matn: 'Задайте вопрос о своих результатах простыми словами — ответит AI Чат.',
        tugma: 'AI Чат',
      },
    ],
  },
  tuzilish: {
    yorliq: 'Архитектура',
    sarlavha: ['Доверие строится не на дизайне —', 'а на архитектуре.'],
    matn: 'Как данные проходят путь от источника до интерфейса и какие правила никогда не нарушаются.',
    oqim: { nom: 'Поток данных', izoh: 'от источника до интерфейса' },
    qatlamlar: [
      { nom: 'Источники', izoh: 'Откуда приходят разговоры', qismlar: ['Telegram Bot API', 'Moi Zvonki', 'Ручная загрузка'] },
      { nom: 'Бэкенд', izoh: 'Приём, очередь, воркер', qismlar: ['Fastify 5 · Node 22', 'Очередь в Postgres', 'Retry + DLQ'] },
      {
        nom: 'AI-слой',
        izoh: 'Не зависит от провайдера',
        qismlar: ['Anthropic · OpenAI-совместимые', 'Цепочка резервирования', 'STT: Whisper / GigaAM'],
      },
      { nom: 'Данные', izoh: 'Одна база, строгие границы', qismlar: ['PostgreSQL 16', 'Drizzle ORM', 'Row Level Security'] },
      { nom: 'Интерфейс', izoh: 'Вы находитесь здесь', qismlar: ['React 18 · Vite', 'TypeScript', 'Узбекский · Русский · Английский'] },
    ],
    rollar: { nom: 'Роли и права', izoh: 'каждый видит только свою зону' },
    rolRoyxat: [
      { nom: 'Владелец', matn: 'Всё, включая подписку и управление руководителями' },
      { nom: 'Руководитель', matn: 'Аналитика команды, критерии, решения по возражениям' },
      { nom: 'Начальник отдела', matn: 'Менеджеры своего отдела и их результаты' },
      { nom: 'Аудитор', matn: 'Право просмотра — для контроля качества' },
      { nom: 'Менеджер', matn: 'Свой кабинет, разговоры, задачи и возражения' },
    ],
    rolEslatma: 'Границы проверяются на сервере — интерфейс лишь скрывает ненужные кнопки.',
    tamoyillar: [
      {
        nom: 'Нет балла без доказательства',
        matn: 'Это не договорённость, а гарантия на уровне базы данных: балл без цитаты база просто не примет.',
      },
      {
        nom: 'Изоляция арендаторов',
        matn: 'Данные каждого бизнеса разделены через Row Level Security: даже если фильтр забыт в коде, база не вернёт чужую строку.',
      },
      {
        nom: 'Плейбук версионируется',
        matn: 'Критерий не редактируется на месте — каждое изменение становится новой версией. Баллы прошлого месяца не пересматриваются по сегодняшним критериям.',
      },
      {
        nom: 'Безопасный вход',
        matn: 'Пароли хранятся в argon2id, сессия — в httpOnly cookie. При краже токена все сессии мгновенно отзываются.',
      },
      {
        nom: 'Правила считает код',
        matn: 'Веса и расчёты с чёткими правилами — в детерминированном коде. Модель даёт только содержание и не выдумывает цифры.',
      },
    ],
  },
  yakun: {
    sarlavha: ['Всё готово —', 'начнём?'],
    mehmon: 'Войдите в аккаунт — и разговоры вашей команды начнут оцениваться с доказательствами.',
    sozlanmagan: 'Мастер настройки за несколько минут адаптирует платформу под ваш бизнес.',
    oddiy: 'Перейдите в платформу, а если появятся вопросы — поможет AI Чат.',
  },
  pastki: 'Доказательный AI-анализ и коучинг для отдела продаж',
};

// ─── English ──────────────────────────────────────────────────────────────────

const EN: LandingMatn = {
  nav: {
    jarayon: 'Process',
    bolimlar: 'Sections',
    boshlash: 'Get started',
    tuzilish: 'Architecture',
    aria: 'Page sections',
    til: 'Interface language',
  },
  tugma: {
    kirish: 'Sign in',
    platformaga: 'Go to platform',
    sozlash: 'Start setup',
    qandayIshlaydi: 'How it works',
    chiqish: 'Sign out',
    sozlamalar: 'Settings',
    aiChat: 'AI Chat',
    tepaga: 'Back to top',
  },
  hero: {
    yorliq: 'About the product',
    salom: (ism) => `Welcome, ${ism}!`,
    sarlavha: ['Sales run on proof —', 'not guesswork.'],
    lead:
      "SotuvAI scores your sales team's Telegram chats and calls against your company's own sales script, backs every score with an exact quote from the conversation, and gives every rep a clear recommendation for growth.",
    pastga: 'Scroll down',
  },
  faktlar: [
    { nom: 'Proof-backed scores', izoh: 'every score is quoted' },
    { nom: 'Your own script', izoh: 'not a template' },
    { nom: '3 languages', izoh: 'UZ · RU · EN' },
  ],
  xarita: {
    sarlavha: 'Data flow',
    jonli: 'live',
    manbalar: [
      { nom: 'Telegram', izoh: 'chats' },
      { nom: 'Calls', izoh: 'Moi Zvonki' },
      { nom: 'Upload', izoh: 'audio · text' },
    ],
    natijalar: [
      { nom: 'Proven score', izoh: 'with a quote' },
      { nom: 'Task', izoh: 'from a promise' },
      { nom: 'Alert', izoh: 'risky moment' },
      { nom: 'Coaching', izoh: 'clear advice' },
    ],
    markaz: { nom: 'AI analysis', izoh: 'by your own script' },
  },
  jarayon: {
    yorliq: 'Process',
    sarlavha: ['From conversation to coaching —', 'five steps.'],
    matn: 'Keep scrolling: the scene on the right shows what happens at each step. Click a step number to jump to it.',
    qadam: 'Step',
    avto: 'Automatic — no setup needed',
    chiziqAria: 'Process steps',
    qadamAria: (raqam, nom) => `Step ${raqam}: ${nom}`,
    qadamlar: [
      {
        nom: 'Connect your channels',
        qisqa: 'Connect',
        matn:
          "The Telegram bot and telephony are connected once — after that, conversations flow in on their own. The bot only sees chats it was added to and never touches a rep's personal messages.",
        bandlar: [
          'Telegram Bot API — group and private chats',
          'Moi Zvonki — call recordings, automatically',
          'Manual upload — audio or text for testing',
        ],
        joy: 'Settings → Telegram bot',
      },
      {
        nom: 'Collect conversations',
        qisqa: 'Collect',
        matn:
          'Messages are grouped into a conversation session. Once the customer has been silent for 20 minutes, the conversation is considered finished and sent for analysis. Call audio is transcribed first.',
        bandlar: [
          'A new message triggers a full re-evaluation',
          'Audio → text: local Whisper or cloud STT',
          'Speakers are separated (rep / customer)',
        ],
        joy: 'Settings → Speech to text',
      },
      {
        nom: 'Evidence-based analysis',
        qisqa: 'Analysis',
        matn:
          'AI scores each conversation against your script. Every score comes with a quote from the transcript — and CODE, not the model, verifies that the quote actually exists.',
        bandlar: [
          'Pre-filter: low-value conversations are dropped without an LLM',
          'Extraction: facts, promises, objections',
          'No quote found — the score is "undetermined" and flagged for review',
        ],
        joy: 'Settings → Scoring criteria',
      },
      {
        nom: 'Results and action',
        qisqa: 'Results',
        matn:
          "Analysis alone isn't the value — action is. A rep's promises become tasks with deadlines, and risky situations become alerts.",
        bandlar: [
          '"I\'ll call you tomorrow" → a task with a deadline',
          'Red flag, unanswered customer, overdue promise',
          'Lead quality: hot, warm, cold — with an AI summary',
        ],
      },
      {
        nom: 'Coaching and growth',
        qisqa: 'Coaching',
        matn:
          'Reps see their score side by side with the team average. If they disagree, they file an appeal; the supervisor decides and leaves a comment. The loop is closed.',
        bandlar: [
          'Own score and team average for every criterion',
          "Appeal → supervisor's decision → comment back to the rep",
          'Daily report to Telegram at a set hour',
        ],
        joy: 'Settings → Daily report',
      },
    ],
    sahna: {
      integratsiyalar: [
        { nom: 'Telegram bot', izoh: 'Sales groups and chats', holat: 'Connected' },
        { nom: 'Moi Zvonki', izoh: 'Call recordings', holat: 'Connected' },
        { nom: 'Manual upload', izoh: 'Audio or text file', holat: 'Ready' },
      ],
      botIzoh: 'The bot only sees chats it was added to — personal messages stay private.',
      yozishma: 'Chat',
      pufaklar: ['How much is the course?', 'First, may I ask your goal — is it to get a job?', 'Yes, for a job.'],
      jimlik: '20 min of silence → analysis',
      qongiroq: 'Call',
      stt: 'speech → text',
      menejer: 'Rep',
      mijoz: 'Customer',
      transkript: ["Hello, I'm calling about the course…", 'Yes, go ahead. I wanted to know the price.'],
      quvur: [
        { nom: 'Pre-filter', izoh: 'Low-value chats filtered out' },
        { nom: 'Extraction', izoh: 'Facts, promises, objections' },
        { nom: 'Evidence scoring', izoh: 'Every criterion — with a quote' },
        { nom: 'Evidence check', izoh: 'Is the quote in the transcript?' },
      ],
      kod: 'code',
      iqtibos: '“Installment payments are available”',
      topildi: 'found in transcript',
      umumiyBall: 'Overall score',
      isbotlar: '3 pieces of evidence · sample',
      vazifa: { nom: 'Task · automatic', izoh: 'Tomorrow 3:00 PM — call back' },
      ogoh: { nom: 'Alert', izoh: 'Unanswered customer — 2 hours' },
      lid: { nom: 'Lead quality', izoh: 'Hot lead · reply fast' },
      kouching: { nom: 'Coaching', izoh: 'loop' },
      halqa: ['AI scores', 'Rep reviews', 'Appeal', "Supervisor's note"],
      hisobot: 'The daily report is sent to Telegram at a set time',
    },
  },
  bolimlar: {
    yorliq: 'Platform sections',
    sarlavha: ['Every screen —', 'answers one question.'],
    matnMehmon: "The platform's main sections — each built for one clear job.",
    matnRahbar: 'Sections available to you as a supervisor. Click a card to open it.',
    matnSotuvchi: 'Sections available to you. Click a card to open it.',
    rahbarUchun: 'For supervisors',
    bosh: {
      nom: 'Home',
      rahbar: {
        matn: "Understand your team's state in 30 seconds: pulse, quality, who works when, and what needs attention.",
        imkonlar: ['Key metrics and trends', 'Activity heatmap', 'Rep leaderboard'],
      },
      sotuvchi: {
        matn: 'Your personal cabinet — a tool for growth, not control. Your score and the team average for every criterion.',
        imkonlar: ['Your weakest spot and a tip', 'Comments from your supervisor', 'Status of your appeals'],
      },
    },
    royxat: {
      qongiroqlar: {
        nom: 'Calls',
        matn: 'All calls and chats in one list — with transcript, score and evidence.',
        imkonlar: ['Filter by status, date, rep', 'Click a score to see the quote', 'Filters are saved in the link'],
      },
      aiChat: {
        nom: 'AI Chat',
        matn: "An assistant for your team's data: ask in plain language, get answers backed by numbers.",
        imkonlar: ['Ready-made question cards', 'Chat history is saved'],
      },
      analitika: {
        nom: 'Analytics',
        matn: 'One period, several perspectives: quality control, team coaching, task and customer analysis.',
        imkonlar: ['By day, week or month', 'Where the team loses points', 'Shareable link'],
      },
      kunlik: {
        nom: 'Daily report',
        matn: 'A team report for a day, week or month — alongside the original text sent to Telegram.',
        imkonlar: ['Comparison with the previous period', 'Automatic delivery to Telegram'],
      },
      lidlar: {
        nom: 'Lead summaries',
        matn: 'A short customer summary for every analyzed conversation: lead quality, weakest spot and score.',
        imkonlar: ['Hot · warm · cold', 'AI summary and recommendation'],
      },
      ogoh: {
        nom: 'Alerts',
        matn: 'Events that need immediate attention — created by the system, never duplicated.',
        imkonlar: ['Red flag, unanswered customer', 'New → seen → resolved'],
      },
      sozlamalar: {
        nom: 'Settings',
        matn: 'Tailor the platform to your business: criteria, team, integrations, work schedule and notifications.',
        imkonlar: ['Scoring criteria and questionnaire', 'Reps and supervisors', 'Telegram bot, Moi Zvonki'],
      },
    },
  },
  boshlash: {
    yorliq: 'Getting started',
    sarlavhaRahbar: ['Your first result in', 'five steps.'],
    sarlavhaSotuvchi: ['Get the most', 'out of the platform.'],
    matnRahbar:
      "Follow the order: once a channel is connected, conversations start flowing in, and the criteria define how they're scored.",
    matnSotuvchi: 'Five habits — and the system becomes your personal coach, not a supervisor.',
    ixtiyoriy: 'Optional',
    rahbar: [
      {
        nom: 'Connect the Telegram bot',
        matn: 'Add the bot to your sales groups — conversations are collected from that moment on.',
        tugma: 'Connect bot',
      },
      {
        nom: 'Connect calls',
        matn: 'Link your Moi Zvonki account — recordings are transcribed and scored just like chats.',
        tugma: 'Moi Zvonki',
      },
      {
        nom: 'Add your team',
        matn: 'Each rep gets a login and sets their own password via an activation link.',
        tugma: 'Reps',
      },
      {
        nom: 'Add your script',
        matn: 'Scoring criteria and weights are your sales script. Every change creates a new version, so past scores stay intact.',
        tugma: 'Criteria',
      },
      {
        nom: 'Track the results',
        matn: 'Team status on Home and in Analytics; conversations that need attention in Alerts.',
        tugma: 'Analytics',
      },
    ],
    sotuvchi: [
      {
        nom: 'Open your cabinet',
        matn: 'Your score and the team average for every criterion — instantly see where to grow.',
        tugma: 'Cabinet',
      },
      {
        nom: 'Open the evidence',
        matn: "Click a score in the conversation view — the message it's based on is highlighted in the chat.",
        tugma: 'Calls',
      },
      {
        nom: 'Disagree? Appeal',
        matn: 'You can appeal any criterion. Your supervisor decides and leaves a comment.',
        tugma: 'Conversations',
      },
      {
        nom: 'Keep your promises',
        matn: 'Promises to customers automatically become tasks with deadlines — none get forgotten.',
        tugma: 'Tasks',
      },
      {
        nom: 'Ask the AI',
        matn: 'Ask about your results in plain language — AI Chat will answer.',
        tugma: 'AI Chat',
      },
    ],
  },
  tuzilish: {
    yorliq: 'Architecture',
    sarlavha: ["Trust isn't designed —", "it's engineered."],
    matn: 'How data flows from source to interface, and which rules are never broken.',
    oqim: { nom: 'Data flow', izoh: 'from source to interface' },
    qatlamlar: [
      { nom: 'Sources', izoh: 'Where conversations come from', qismlar: ['Telegram Bot API', 'Moi Zvonki', 'Manual upload'] },
      { nom: 'Backend', izoh: 'Intake, queue, worker', qismlar: ['Fastify 5 · Node 22', 'Queue in Postgres', 'Retry + DLQ'] },
      {
        nom: 'AI layer',
        izoh: 'Provider-agnostic',
        qismlar: ['Anthropic · OpenAI-compatible', 'Fallback chain', 'STT: Whisper / GigaAM'],
      },
      { nom: 'Data', izoh: 'One database, strict boundaries', qismlar: ['PostgreSQL 16', 'Drizzle ORM', 'Row Level Security'] },
      { nom: 'Interface', izoh: 'Where you are now', qismlar: ['React 18 · Vite', 'TypeScript', 'Uzbek · Russian · English'] },
    ],
    rollar: { nom: 'Roles and permissions', izoh: 'everyone sees only their own scope' },
    rolRoyxat: [
      { nom: 'Owner', matn: 'Everything, including the subscription and managing supervisors' },
      { nom: 'Supervisor', matn: 'Team analytics, criteria, resolving appeals' },
      { nom: 'Department head', matn: 'Reps in their department and their results' },
      { nom: 'Auditor', matn: 'View-only access — for quality control' },
      { nom: 'Sales rep', matn: 'Own cabinet, conversations, tasks and appeals' },
    ],
    rolEslatma: 'Access is enforced on the server — the interface only hides irrelevant buttons.',
    tamoyillar: [
      {
        nom: 'No score without evidence',
        matn: 'Not an agreement — a database-level guarantee. The database rejects any score without a quote.',
      },
      {
        nom: 'Tenant isolation',
        matn: "Each business's data is separated with Row Level Security: even if code forgets a filter, the database won't return another tenant's rows.",
      },
      {
        nom: 'Versioned playbook',
        matn: "Criteria are never edited in place — every change is a new version. Last month's scores aren't reinterpreted by today's criteria.",
      },
      {
        nom: 'Secure sign-in',
        matn: 'Passwords are hashed with argon2id and the session lives in an httpOnly cookie. If a token is stolen, all sessions are revoked instantly.',
      },
      {
        nom: 'Code does the math',
        matn: 'Weights and rule-based calculations live in deterministic code. The model only provides content — it never invents numbers.',
      },
    ],
  },
  yakun: {
    sarlavha: ['All set —', 'shall we begin?'],
    mehmon: "Sign in — and your team's conversations will start being scored with evidence.",
    sozlanmagan: 'A few-minute setup wizard tailors the platform to your business.',
    oddiy: 'Go to the platform — and if you have questions, AI Chat is here to help.',
  },
  pastki: 'Evidence-based AI analysis and coaching for sales teams',
};

export const MATN: Record<Til, LandingMatn> = { uz: UZ, ru: RU, en: EN };

/** Til almashtirgichdagi variantlar — tartibi ekranda shunday. */
export const TILLAR: { til: Til; qisqa: string; nom: string }[] = [
  { til: 'uz', qisqa: 'UZ', nom: "O'zbekcha" },
  { til: 'ru', qisqa: 'RU', nom: 'Русский' },
  { til: 'en', qisqa: 'EN', nom: 'English' },
];

/** Joriy tildagi landing matnlari. */
export function useMatn(): LandingMatn {
  const { til } = useTil();
  return MATN[til];
}
