import type { Lugat } from './index';

/**
 * INGLIZCHA LUG'AT.
 *
 * Kalit — o'zbekcha matnning O'ZI (sabab `index.tsx` da). Bu yerda yo'q
 * matn ekranda o'zbekcha qoladi, kalit ko'rinmaydi.
 *
 * TARJIMA QOIDALARI
 * ─────────────────
 * • Atamalar izchil: "suhbat" → conversation, "mezon" → criterion,
 *   "ball" → score, "lid" → lead, "sotuvchi/menejer" → rep,
 *   "playbook" → playbook (tarjima qilinmaydi, mahsulot atamasi).
 * • Sxema va rang nomlari (Slate, Mint, Navy…) tarjima QILINMAYDI —
 *   ular atash nomlari.
 * • "Aniqlanmadi" → "Not determined": bu 0 ball emas, o'lchab
 *   bo'lmaganini bildiradi va tarjimada ham shu farq saqlanishi shart.
 */
export const EN: Lugat = {
  // ─── Umumiy holat va harakatlar ───────────────────────────────────────────
  'Yuklanmoqda…': 'Loading…',
  'Yangilanmoqda…': 'Updating…',
  'Saqlash': 'Save',
  'Saqlanmoqda…': 'Saving…',
  'Saqlandi ✓': 'Saved ✓',
  'Bekor': 'Cancel',
  'Yopish': 'Close',
  'Ochish': 'Open',
  'Ko\'rish': 'View',
  'Qo\'shish': 'Add',
  '+ Qo\'shish': '+ Add',
  'Qo\'yish': 'Set',
  'O\'chirish': 'Disable',
  'Olib tashlash': 'Remove',
  'Yaratish': 'Generate',
  'Yuborish': 'Send',
  'Hozir yuborish': 'Send now',
  'Qayta urinish': 'Retry',
  'Tayyor': 'Ready',
  'Tayyor!': 'Done!',
  'Xato': 'Error',
  'Hammasi': 'All',
  'Barchasi': 'All',
  'Hammasi →': 'View all →',
  '← Orqaga': '← Back',
  '← Dashboard': '← Dashboard',
  '← Suhbatlar': '← Conversations',
  '← Kirishga qaytish': '← Back to sign in',
  '‹ Lid xulosalari': '‹ Lead summaries',
  'Davom etish →': 'Continue →',
  'Filtrlarni tozalash': 'Clear filters',
  'Yig\'ish': 'Collapse',
  'Uzish': 'Disconnect',
  'Ulash': 'Connect',
  'Ulangan': 'Connected',
  'Ulanmagan': 'Not connected',
  'Faollashtirish': 'Activate',
  'Biriktirish': 'Attach',
  'Havola': 'Link',
  'Versiya': 'Version',
  'Turi': 'Type',
  'Vaqt': 'Time',
  'Sana': 'Date',
  'Hozir': 'Now',
  'Bugun': 'Today',
  'Izoh': 'Note',
  'Matn': 'Text',
  'Xulosa': 'Summary',
  'Jami': 'Total',
  'Jami:': 'Total:',
  'O\'rtacha': 'Average',
  'O\'rtacha:': 'Average:',
  'Farq': 'Change',
  'Manba': 'Source',
  'Amal': 'Action',
  'Holat': 'Status',
  'Rol': 'Role',
  'Nomi': 'Name',
  'Ism': 'Name',
  'Ismi yo\'q': 'No name',
  'Ismingiz': 'Your name',
  'Ism familiya': 'Full name',
  'Email': 'Email',
  'Telefon': 'Phone',
  'Kompaniya': 'Company',
  'Lavozim': 'Position',
  'Muddat': 'Due',
  'Muddat:': 'Due:',
  'Muhlat': 'Deadline',
  'Yaratildi': 'Created',
  'Yaratilgan': 'Created',
  'Boshlanish': 'Start',
  'Tugash': 'End',
  'Boshlanish sanasi': 'Start date',
  'Tugash sanasi': 'End date',
  'Yo\'nalish': 'Direction',
  'Bosqich': 'Stage',
  'Taqsimot': 'Distribution',

  // ─── Yon panel va banner ─────────────────────────────────────────────────
  'Menyuni ochish': 'Open menu',
  'Menyuni yopish': 'Close menu',
  'Analitika bo\'limlari': 'Analytics sections',
  'Mening kabinetim': 'My workspace',
  'Mening suhbatlarim': 'My conversations',
  'Mening vazifalarim': 'My tasks',
  'To\'lov': 'Billing',
  '— boshqarish →': '— manage →',
  'Sinov muddati: {n} kun qoldi': 'Trial: {n} days left',
  'To\'lov kechikdi — {n} kundan keyin tahlil to\'xtaydi':
    'Payment is late — analysis stops in {n} days',
  'Obuna faol emas — yangi tahlil to\'xtatilgan. Balansni to\'ldiring.':
    'Subscription inactive — new analysis is paused. Please top up your balance.',
  'asosiy': 'primary',
  '{n} ta ibora': '{n} phrases',
  'Til shu qurilmada almashdi, lekin hisobga saqlanmadi — boshqa qurilmada eski til qoladi.':
    'The language changed on this device but was not saved to your account — other devices will keep the old one.',

  // ─── Navigatsiya ──────────────────────────────────────────────────────────
  'Dashboard': 'Dashboard',
  'Analitika': 'Analytics',
  'Suhbatlar': 'Conversations',
  'Suhbat': 'Conversation',
  'Vazifalar': 'Tasks',
  'Vazifa': 'Task',
  'Ogohlantirishlar': 'Alerts',
  'Ogohlantirish': 'Alert',
  'Kunlik hisobot': 'Daily report',
  'Lid xulosalari': 'Lead summaries',
  'Lidlar': 'Leads',
  'Sozlamalar': 'Settings',
  'Chiqish': 'Sign out',
  'Baholash mezonlari': 'Scoring criteria',
  'Boshqaruv paneliga o\'tish': 'Go to dashboard',
  'Menejer kabinetini ochish': 'Open rep workspace',

  // ─── Analitika bo'limlari ────────────────────────────────────────────────
  'Umumiy ko\'rinish': 'Overview',
  'Sifat nazorati': 'Quality control',
  'Jamoa malakasi': 'Team skills',
  'Vazifalar tahlili': 'Task analysis',
  'Mijoz tahlili': 'Customer analysis',
  'Faoliyat tahlili': 'Activity analysis',
  'Lid analitikasi': 'Lead analytics',

  // ─── Sozlamalar bo'limlari ───────────────────────────────────────────────
  'Profil': 'Profile',
  'Ko\'rinish': 'Appearance',
  'Biznes': 'Business',
  'Bizneslar': 'Businesses',
  'Rahbarlar': 'Managers',
  'Menejerlar': 'Reps',
  'Sotuvchilar': 'Reps',
  'Sotuvchi': 'Rep',
  'Menejer': 'Rep',
  'Ish jadvali': 'Work schedule',
  'Obuna': 'Subscription',
  'Integratsiyalar': 'Integrations',
  'Bildirishnomalar': 'Notifications',
  'Umumiy': 'General',
  'AI va integratsiya': 'AI and integrations',
  'Hozircha yon panel va Sozlamalar bo\'limi tarjima qilingan. Qolgan sahifalar o\'zbekcha ko\'rinadi — ular bosqichma-bosqich qo\'shilmoqda.':
    'For now the sidebar and the Settings section are translated. The remaining pages stay in Uzbek — they are being added step by step.',
  'Profil, jamoa, ish jadvali va ulanishlar': 'Profile, team, schedule and connections',

  // ─── Ko'rinish ────────────────────────────────────────────────────────────
  'Mavzu': 'Theme',
  'Til': 'Language',
  'Interfeys tili': 'Interface language',
  'Asosiy rang': 'Accent color',
  'Tizim bo\'yicha': 'System',
  'Qurilma sozlamasiga ergashadi': 'Follows your device setting',
  'Yorug\'': 'Light',
  'Har doim yorug\' mavzu': 'Always light',
  'Qorong\'i': 'Dark',
  'Har doim qorong\'i mavzu': 'Always dark',
  'Ko\'rinish shu qurilmada saqlanadi va boshqa foydalanuvchilarga ta\'sir qilmaydi.':
    'Appearance is saved on this device and does not affect other users.',
  'Iliq': 'Warm',
  'Neytral': 'Neutral',
  'Qora': 'Black',
  'Qizil': 'Red',
  'Ko\'k': 'Blue',
  'Yashil': 'Green',
  'Siyoh': 'Violet',
  'keyin qo\'llanadi': 'applied later',
  'tarjima yo\'q': 'no translation',
  'O\'zbekcha': 'O\'zbekcha',
  'English': 'English',
  'Русский': 'Русский',

  // ─── Kirish va parol ─────────────────────────────────────────────────────
  'Kiring': 'Sign in',
  'Parol': 'Password',
  'Joriy parol': 'Current password',
  'Yangi parol': 'New password',
  'Parolni takrorlang': 'Repeat password',
  'Parolni o\'zgartirish': 'Change password',
  'Parolni unutdingizmi?': 'Forgot your password?',
  'Parollar mos kelmadi': 'Passwords do not match',
  'Yangi parol o\'rnating': 'Set a new password',
  'Parol havolasi': 'Password link',
  'Ro\'yxatdan o\'ting': 'Sign up',
  'Kamida 10 belgi. Uzunlik murakkablikdan muhimroq.':
    'At least 10 characters. Length matters more than complexity.',
  'Kamida 10 belgi. Rahbar buni ko\'radi.': 'At least 10 characters. Your manager will see it.',
  'Parol o\'zgargach boshqa barcha qurilmalardagi sessiyalar bekor qilinadi.':
    'Changing the password signs you out on all other devices.',
  'Parol o\'zgargach barcha qurilmalardagi eski sessiyalar bekor qilinadi.':
    'Changing the password ends every older session on all devices.',
  'Havola eskirgan bo\'lsa, kirish ekranidan yangisini so\'rang.':
    'If the link has expired, request a new one from the sign-in screen.',
  'Telegram bog\'lanmagan bo\'lsa — rahbaringizdan tiklash havolasini so\'rang.':
    'If Telegram is not linked, ask your manager for a reset link.',
  'Agar bunday hisob mavjud bo\'lsa va Telegram bog\'langan bo\'lsa, tiklash havolasi yuborildi. Havola 30 daqiqa amal qiladi.':
    'If that account exists and has Telegram linked, a reset link has been sent. It is valid for 30 minutes.',

  // ─── Ball va baholash ────────────────────────────────────────────────────
  'Ball': 'Score',
  'Yangi ball': 'New score',
  'O\'rtacha ball': 'Average score',
  'o\'rtacha ball:': 'average score:',
  'Baholash': 'Scoring',
  'Baholandi': 'Scored',
  'Baholangan': 'Scored',
  'Baholangan kategoriyalar': 'Scored categories',
  'Tahlil qilingan': 'Analyzed',
  'Tahlilda': 'Analyzing',
  'Tahlil ketmoqda…': 'Analyzing…',
  'Mezon': 'Criterion',
  'Mezon nomi': 'Criterion name',
  'Mezonlar bo\'yicha baho': 'Scores by criterion',
  'Mezonlar bo\'yicha jamoa': 'Team by criterion',
  'Kuchli tomoni': 'Strength',
  'Nima yaxshi': 'What went well',
  'Nimani tuzatish': 'What to fix',
  'Shunday deyish mumkin edi': 'A better way to say it',
  'Asosiy kamchilik:': 'Main gap:',
  'Zaif bosqich': 'Weakest stage',
  'Zaif holatlar': 'Weak cases',
  'Zaif baho qayd etilmagan': 'No weak scores recorded',
  'Qizil bayroq': 'Red flag',
  'Qizil bayroqlar': 'Red flags',
  'Qoidabuzarlik': 'Violation',
  'Bayroqlangan': 'Flagged',
  'ko\'rik talab qiladi': 'needs review',
  '⚑ ko\'rik kerak': '⚑ review needed',
  '⚑ bayroq': '⚑ flag',
  'Bahoga e\'tiroz': 'Appeal this score',
  'Bu baho noto\'g\'ri deb hisoblayman': 'I believe this score is wrong',
  'Qabul qilish': 'Accept',
  'Rad etish': 'Reject',
  'Rad etish sababi': 'Reason for rejection',
  'Hal qilingan': 'Resolved',
  'Ochiq': 'Open',
  'Rahbar izohi': 'Manager note',
  'Klassifikatsiya ishonchi': 'Classification confidence',
  'Speaker aniqlash usuli': 'Speaker detection method',
  'Biznesga tegishliligi': 'Business relevance',
  'Murojaat turi': 'Request type',
  'Murojaat turlari': 'Request types',
  'Xizmat yo\'nalishi': 'Service line',

  // ─── Suhbat ──────────────────────────────────────────────────────────────
  'Suhbat detali': 'Conversation detail',
  'Suhbat dinamikasi': 'Conversation dynamics',
  'Suhbat konteksti': 'Conversation context',
  'Suhbat matni': 'Transcript',
  'Suhbatni ochish': 'Open conversation',
  'suhbatni ko\'rish →': 'view conversation →',
  'Yozishma': 'Chat',
  'Xabarlar': 'Messages',
  'Kanal': 'Channel',
  'Kontakt': 'Contact',
  'Mijoz': 'Customer',
  'Mijoz:': 'Customer:',
  'Menejer:': 'Rep:',
  'Javob': 'Reply',
  'Javob berildi': 'Replied',
  'Javob berilgan': 'Replied',
  'Javob kutmoqda': 'Awaiting reply',
  'Javobsiz': 'No reply',
  'Javob tezligi': 'Response speed',
  'Median javob': 'Median response',
  'Birinchi javob': 'First response',
  'Birinchi aloqa': 'First contact',
  'Oxirgi aloqa': 'Last contact',
  'Oxirgi murojaat': 'Last request',
  'Kelishuvlar': 'Commitments',
  'Va\'dalar:': 'Commitments:',
  'Savolnoma': 'Questionnaire',
  'Anketa savollari': 'Questionnaire items',
  'Audio yozuv': 'Audio recording',
  'Audio fayl': 'Audio file',
  'Audio pozitsiyasi': 'Audio position',
  'Bu mijoz bilan oldingi suhbatlar': 'Earlier conversations with this customer',
  'Bu — bu mijoz bilan birinchi qayd etilgan suhbat':
    'This is the first recorded conversation with this customer',
  'Mijoz ma\'lumoti aniqlanmadi': 'Customer details not determined',
  'Isbotga bosing — yozishmadagi aynan o\'sha joy ochiladi':
    'Click the evidence to jump to that exact spot in the chat',
  'Har bir bahoning ortida transkriptdagi aniq iqtibos turadi — suhbatni ochib ko\'rishingiz mumkin.':
    'Every score is backed by an exact quote from the transcript — you can open the conversation to check.',
  'Iqtibos yozishmada bor-yo\'qligi tekshiriladi — ball qo\'ygan odam ham isbot keltiradi, xuddi AI kabi.':
    'The quote is verified against the chat — a human scorer must provide evidence too, exactly like the AI.',

  // ─── Vazifalar ───────────────────────────────────────────────────────────
  'Ochiq vazifa': 'Open task',
  'Ochiq vazifalar': 'Open tasks',
  'Ochiq vazifa yo\'q': 'No open tasks',
  'Vazifa yo\'q': 'No tasks',
  '+ Yangi vazifa': '+ New task',
  'Navbatda': 'Queued',
  'Bajarildi': 'Done',
  'Bajarilish': 'Completion',
  'Bekor qilingan': 'Cancelled',
  'Kechikkan': 'Late',
  'Muddati o\'tgan': 'Overdue',
  'Muddati o\'tdi': 'Overdue',
  'Qo\'lda qo\'shilgan': 'Added manually',
  'AI yaratgan': 'Created by AI',
  'Baholangan suhbatdan': 'From a scored conversation',
  'Baholanmagan suhbatdan': 'From an unscored conversation',
  'Vazifalar manbasi': 'Task source',
  'AI suhbatlardagi va\'dalardan avtomatik yaratadi':
    'AI creates these automatically from commitments made in conversations',
  'Bu ko\'rinishda vazifa yo\'q': 'No tasks in this view',

  // ─── Lidlar ──────────────────────────────────────────────────────────────
  'Lid qiymati': 'Lead value',
  'Bitim': 'Deal',
  'Summa': 'Amount',
  'Qaytish imkoniyati': 'Recovery chance',
  'Imkoniyat bo\'yicha': 'By opportunity',
  'Nega to\'xtadi': 'Why it stalled',
  'Keyingi eng yaxshi qadam': 'Best next step',
  'Signallar va e\'tirozlar': 'Signals and objections',
  'Har bir lidning butun tarixi asosida tahlil':
    'Analysis based on each lead\'s full history',
  'Baholangan lid yo\'q': 'No scored leads',
  'Sabab: barchasi': 'Reason: all',
  'Holat: barchasi': 'Status: all',
  'Sotuvchi: barchasi': 'Rep: all',
  'Menejer: barchasi': 'Rep: all',
  'Aniq e\'tiroz yoki zaif mezon qayd etilmagan':
    'No specific objection or weak criterion recorded',
  'Sovib qolgan lid yo\'q — barcha kontaktlar bilan aloqa yaqinda bo\'lgan.':
    'No cooling leads — every contact has been reached recently.',
  'Sovib qolgan lidlarda zaif baho qayd etilmagan':
    'No weak scores recorded on cooling leads',
  'Qayta bog\'lanish kerak bo\'lgan lid yo\'q — barcha kontaktlar bilan aloqa yaqinda bo\'lgan.':
    'No leads need a follow-up — every contact has been reached recently.',

  // ─── Davr filtrlari ──────────────────────────────────────────────────────
  '7 kun': '7 days',
  '30 kun': '30 days',
  '90 kun': '90 days',
  '3 kun': '3 days',
  '3 oy': '3 months',
  'Hafta': 'Week',
  'Oy': 'Month',
  'Shu kun': 'This day',
  'Oldingi kun': 'Previous day',
  'Oldingi hafta': 'Previous week',
  'Keyingi hafta': 'Next week',
  'Butun davr': 'All time',
  'Davr bo\'yicha': 'By period',
  'Sana bo\'yicha': 'By date',
  'Oxirgi 30 kun': 'Last 30 days',
  'Oxirgi 90 kun': 'Last 90 days',
  'Oxirgi 6 oy': 'Last 6 months',
  'Oxirgi yil': 'Last year',
  'Tanlangan davrda': 'In the selected period',
  'tanlangan oraliq': 'selected range',
  'shu davr uchun': 'for this period',
  'Davr bajarilishi': 'Period completion',
  'Davrda bajarildi': 'Completed in period',
  'Oldingi ish kuni bilan solishtirish': 'Compared with the previous working day',
  '1 soatgacha': 'Under 1 hour',
  'ayni damda': 'right now',
  'faqat hozir': 'only now',

  // ─── Bo'sh holatlar ──────────────────────────────────────────────────────
  'Bu davrda ma\'lumot yo\'q': 'No data for this period',
  'Bu davrda baholangan suhbat yo\'q': 'No scored conversations in this period',
  'Bu davrda suhbat yo\'q': 'No conversations in this period',
  'Bu davrda suhbat bo\'lmagan': 'There were no conversations in this period',
  'Bu davrda faollik yo\'q': 'No activity in this period',
  'Bu davrda vazifa yo\'q': 'No tasks in this period',
  'Bu davrda baholanmagan': 'Not scored in this period',
  'Bu davrda yangi kontakt yo\'q': 'No new contacts in this period',
  'Bu davrda va\'da qayd etilmagan': 'No commitments recorded in this period',
  'Bu davrda sotuvchi bo\'yicha baho yo\'q': 'No per-rep scores in this period',
  'Bu davrda sotuvchi faolligi yo\'q': 'No rep activity in this period',
  'Bu davrda kontaktga bog\'langan suhbat yo\'q':
    'No conversations linked to a contact in this period',
  'Bu davrda javobsiz qolib, qayta ham bog\'lanilmagan holat yo\'q.':
    'No cases in this period went unanswered without a follow-up.',
  'Bu kuni suhbat bo\'lmagan.': 'There were no conversations on this day.',
  'Bu kuni sotuvchi faolligi yo\'q': 'No rep activity on this day',
  'Bu kuni mezon bahosi yo\'q.': 'No criterion scores on this day.',
  'Bu kuni anketa javobi yig\'ilmagan.': 'No questionnaire answers collected on this day.',
  'Hali suhbat yo\'q. Telegram botini ulang — yozishmalar avtomatik tushadi.':
    'No conversations yet. Connect the Telegram bot and chats will arrive automatically.',
  'Hali baholangan suhbat yo\'q': 'No scored conversations yet',
  'Hali tahlil qilingan suhbat yo\'q': 'No analyzed conversations yet',
  'Hali sotuvchi qo\'shilmagan': 'No reps added yet',
  'Hali tranzaksiya yo\'q': 'No transactions yet',
  'Hali izoh yo\'q. AI baholaydi, siz kontekst berasiz.':
    'No notes yet. The AI scores; you add the context.',
  'Faol ogohlantirish yo\'q': 'No active alerts',
  'Faol menejer yo\'q': 'No active reps',
  'Suhbat yo\'q': 'No conversations',
  'Muammo yo\'q': 'No issues',
  'Hech qanday biznesga a\'zo emassiz': 'You are not a member of any business',
  'Hech qachon kirmagan': 'Never signed in',
  'To\'liq ball qayd etilmagan': 'No full scores recorded',
  'Byudjet haqida gap qayd etilmagan': 'No mention of budget recorded',
  'Dam olish kuni bo\'lishi yoki Telegram integratsiyasi ishlamagan bo\'lishi mumkin.':
    'It may have been a day off, or the Telegram integration was not working.',

  // ─── Ogohlantirishlar ────────────────────────────────────────────────────
  'Javobsiz mijoz': 'Unanswered customer',
  'Buzilgan va\'da': 'Broken commitment',
  'Inson ko\'rigi kerak': 'Needs human review',
  'Sifat pasayishi': 'Quality drop',
  'Darhol e\'tibor talab qiladigan hodisalar': 'Events that need attention right now',
  'Suhbatda playbookda belgilangan jiddiy qoida buzilgan':
    'A serious playbook rule was broken in the conversation',
  'Suhbatda jiddiy qoida buzilishi aniqlandi':
    'A serious rule violation was detected in the conversation',
  'Mijoz yozgan, lekin menejer javob bermagan': 'The customer wrote and the rep did not reply',
  'Mijoz yozgan, lekin javob berilmagan': 'The customer wrote and got no reply',
  'Suhbatda berilgan so\'z muddatida bajarilmagan':
    'A promise made in the conversation was not kept on time',
  'Suhbatda berilgan so\'z bajarilmagan': 'A promise made in the conversation was not kept',
  'AI o\'z bahosiga ishonchi past — natija tekshirilishi kerak':
    'The AI has low confidence in its score — the result needs checking',
  'AI o\'z bahosiga ishonchi past — tekshiring':
    'The AI has low confidence in its score — please check',
  'Ko\'rsatkich sezilarli tushgan': 'The metric has dropped noticeably',
  'Ko\'rsatkich sezilarli tushdi': 'The metric dropped noticeably',
  'Past ball ogohlantirishi': 'Low-score alert',
  'Baholangan suhbat chegaradan past chiqsa ogohlantirish yaratiladi':
    'An alert is created when a scored conversation falls below the threshold',
  'Eng kam navbat soni': 'Minimum number of turns',
  'Qisqa yozishmalar hisobga olinmaydi — ular tabiiy ravishda past ball oladi.':
    'Short chats are ignored — they naturally score low.',
  'Qaysi hodisa ogohlantirish yaratishini tanlang. O\'chirilgan tur bo\'yicha yangi ogohlantirish umuman yaratilmaydi — mavjudlari joyida qoladi.':
    'Choose which events create alerts. A disabled type creates no new alerts — existing ones stay.',
  'Ogohlantirishlar faqat ish vaqtida': 'Alerts during working hours only',

  // ─── Bildirishnoma kanallari ─────────────────────────────────────────────
  'Qayerga yuborilsin': 'Where to send',
  'Hodisa': 'Event',
  'Veb': 'Web',
  'Bot': 'Bot',
  'Guruh': 'Group',
  'Har doim yoqiq': 'Always on',
  'Ilova ichidagi ro\'yxat — har doim yoqiq': 'The in-app list — always on',
  'Botning shaxsiy yozishmasi': 'The bot\'s direct chat',
  'Telegram guruhi': 'Telegram group',
  'Telegram kanali': 'Telegram channel',
  'Telegram manzillari': 'Telegram destinations',
  'Rahbarning bot bilan shaxsiy yozishmasi': 'The manager\'s direct chat with the bot',
  'Jamoa guruhi — botni guruhga qo\'shing va bitta xabar yozing':
    'Team group — add the bot to the group and post one message',
  'E\'lonlar kanali — botni administrator qiling':
    'Announcement channel — make the bot an administrator',
  'Bildirishnomalar shu manzillarga boradi. Bot ko\'rgan guruh va kanallar ro\'yxatda o\'zi paydo bo\'ladi.':
    'Notifications go to these destinations. Groups and channels the bot has seen appear in the list automatically.',
  'Manzil tanlanmagan ustun o\'chirilgan turadi — xabar baribir hech qayerga bormasdi. Manzillarni quyidagi kartadan sozlang.':
    'A column with no destination stays disabled — the message would have nowhere to go. Set destinations in the card below.',
  'Chat id ni qo\'lda kiritish': 'Enter the chat id manually',
  '— tanlanmagan —': '— not selected —',
  'Sinov xabari': 'Test message',
  'Sinov xabari yuborildi ✓': 'Test message sent ✓',
  'Sotuvchining shaxsiy Telegram hisobini rahbar biriktiradi — Menejerlar bo\'limidagi «ID biriktirish» tugmasi orqali.':
    'A rep\'s personal Telegram account is linked by a manager — via the "Attach ID" button in the Reps section.',

  // ─── CRM eksporti ────────────────────────────────────────────────────────
  'Vazifalarni CRM\'ga yuborish': 'Send tasks to your CRM',
  'Eksport yoqilsin': 'Enable export',
  'Webhook manzili': 'Webhook URL',
  'Imzo siri': 'Signing secret',
  'Sinov so\'rovi': 'Test request',
  'Sinov so\'rovi qabul qilindi ✓': 'Test request accepted ✓',
  'Oxirgi yuborishlar': 'Recent deliveries',
  'Xatolilarni qayta yuborish': 'Resend the failed ones',
  'Qabul qiluvchi tomonda imzoni qanday tekshirish kerak':
    'How to verify the signature on the receiving side',
  'Har so\'rovda ikki sarlavha keladi:': 'Every request carries two headers:',
  'O\'chirilganda vazifalar faqat shu ilovada qoladi — hech qayerga yuborilmaydi.':
    'When off, tasks stay in this app only — nothing is sent anywhere.',

  // ─── Ish jadvali ─────────────────────────────────────────────────────────
  'Ish kunlari': 'Working days',
  'Ish vaqti': 'Working hours',
  'Dushanba': 'Monday',
  'Seshanba': 'Tuesday',
  'Chorshanba': 'Wednesday',
  'Payshanba': 'Thursday',
  'Juma': 'Friday',
  'Shanba': 'Saturday',
  'Yakshanba': 'Sunday',
  'Tugash soati boshlanishdan keyin bo\'lishi kerak': 'End hour must be after the start hour',
  'Menejerlar uchun alohida jadval': 'Separate schedule per rep',
  'Menejerlar jadvali': 'Rep schedules',
  'Biznes jadvaliga qaytarish': 'Revert to the business schedule',
  'Jadvali yo\'q menejer biznes jadvaliga ergashadi — biznes jadvalini o\'zgartirsangiz u ham o\'zgaradi.':
    'A rep without their own schedule follows the business schedule — change the business schedule and theirs changes too.',

  // ─── Biznes sozlamalari ──────────────────────────────────────────────────
  'Biznes sozlamalari': 'Business settings',
  'Biznes ma\'lumotlari': 'Business details',
  'Biznes ID': 'Business ID',
  'Biznes nomi': 'Business name',
  'Slug': 'Slug',
  'Soha': 'Industry',
  'Sohangiz': 'Your industry',
  'Tavsif': 'Description',
  'Valyuta': 'Currency',
  'Vaqt zonasi': 'Time zone',
  'Logotip havolasi': 'Logo URL',
  'Sozlangan': 'Configured',
  'Sozlanmoqda': 'Being configured',
  'Sozlash tugagan': 'Setup finished',
  'Bunga o\'tish': 'Switch to this',
  'Bu qiymatlar o\'zgarmaydi. Qo\'llab-quvvatlashga murojaat qilsangiz, biznes ID sini yuboring.':
    'These values do not change. When contacting support, send your business ID.',
  'Bu maydon bezak emas: AI suhbatni baholashda va yangi playbook tuzishda kontekst sifatida ishlatadi.':
    'This field is not decorative: the AI uses it as context when scoring conversations and building a new playbook.',
  'Biznes nima qiladi, kimga sotadi, qanday sotadi':
    'What the business does, who it sells to, and how',
  'Kunlik hisobot va "bugungi vazifalar" shu zonaga qarab hisoblanadi.':
    'The daily report and "today\'s tasks" are computed in this time zone.',
  'Faol biznes tanlovi shu qurilmada saqlanadi. Barcha bo\'lim va hisobotlar tanlangan biznes bo\'yicha ko\'rsatiladi.':
    'The active business is stored on this device. Every section and report reflects the selected business.',
  'Yangi biznes ochish uchun alohida hisob kerak — bitta hisobdan ikkinchi biznes yaratish hali qo\'shilmagan.':
    'Opening a new business needs a separate account — creating a second business from one account is not available yet.',

  // ─── Profil ──────────────────────────────────────────────────────────────
  'Ulangan hisoblar': 'Connected accounts',
  'Kirish va parol tiklash uchun': 'For sign-in and password reset',
  'Telegram bot': 'Telegram bot',
  'Suhbatlar shu bot orqali keladi': 'Conversations arrive through this bot',
  'Yoki tashqi havola kiriting': 'Or enter an external link',
  'Bu havoladan rasm yuklanmadi — hozircha ism harflari ko\'rsatilmoqda.':
    'The image could not be loaded from that link — showing initials for now.',
  'Email o\'zgartirish yangi manzilni tasdiqlashni talab qiladi — hozircha qo\'llab quvvatlanmaydi.':
    'Changing your email requires confirming the new address — not supported yet.',
  'Til va mavzu': 'Language and theme',
  'Interfeys tilini tanlang. Bu — hisob sozlamasi: qaysi qurilmadan kirsangiz ham saqlanadi.':
    'Choose the interface language. This is an account setting: it follows you across devices.',
  'Bosiladigan hamma narsa — tugma, faol menyu, fokus halqasi — shu rangda bo\'ladi. Ball va ogohlantirish ranglari o\'zgarmaydi: ular ma\'noni bildiradi, bezak emas.':
    'Everything clickable — buttons, the active menu item, the focus ring — uses this color. Score and alert colors stay the same: they carry meaning, not decoration.',

  // ─── Jamoa ───────────────────────────────────────────────────────────────
  'Jamoa': 'Team',
  'Jamoa trendi': 'Team trend',
  'Jamoa holati bir qarashda': 'Team status at a glance',
  'Kouching': 'Coaching',
  'Faol': 'Active',
  'Kutilmoqda': 'Pending',
  'O\'chirilgan': 'Disabled',
  'o\'chirilgan': 'disabled',
  'To\'xtatilgan': 'Suspended',
  'Faol sotuvchilar': 'Active reps',
  'Sotuvchilar reytingi': 'Rep leaderboard',
  'Sotuvchi ismi': 'Rep name',
  'Yangi sotuvchi': 'New rep',
  'Aktivatsiya havolasi': 'Activation link',
  'Telegram ID biriktirish': 'Attach Telegram ID',
  'ID biriktirish': 'Attach ID',
  'Rahbar taklif qilish': 'Invite a manager',
  'Taklif qilish': 'Invite',
  'Oxirgi kirish': 'Last sign-in',
  'Menejerni ochish': 'Open rep',
  'Menejer-mezon xaritasi': 'Rep × criterion map',
  'Kimga aynan qaysi mezonni o\'rgatish kerakligi': 'Who needs coaching on which criterion',
  'Ega rolini o\'zgartirib bo\'lmaydi — to\'lov va odamlar ustidan nazorat egada qoladi.':
    'The owner role cannot be changed — billing and people stay under the owner\'s control.',
  'Sizning hisobingiz sotuvchi o\'rniga bog\'lanmagan — kabinet ko\'rsatib bo\'lmaydi.':
    'Your account is not linked to a rep seat — the workspace cannot be shown.',
  'Avval sotuvchi qo\'shing': 'Add a rep first',
  'sotuvchi biriktirilmagan': 'no rep attached',

  // ─── Obuna ───────────────────────────────────────────────────────────────
  'Balans': 'Balance',
  'Balansni to\'ldirish': 'Top up balance',
  'Qoldiq': 'Remaining',
  'Oylik xarajat': 'Monthly cost',
  'Bitta seat / oy': 'Per seat / month',
  'Tranzaksiyalar': 'Transactions',
  'To\'lov va obuna': 'Billing and subscription',
  'Sinov muddati': 'Trial period',
  'Bepul foydalanish davri': 'Free trial period',
  'Obuna to\'langan, hammasi ishlaydi': 'Subscription paid, everything works',
  'To\'lov kechikdi, lekin hammasi hali ishlayapti': 'Payment is late, but everything still works',
  'Yangi tahlil to\'xtatildi. Ma\'lumot yig\'ish davom etadi, eski natijalar ko\'rinadi.':
    'New analysis is paused. Data collection continues and past results stay visible.',
  'Seat asosida narxlash — sotuvchilar soniga qarab': 'Seat-based pricing — by number of reps',
  'Hozircha qo\'lda kiritiladi — bank o\'tkazmasi yoki Payme/Click orqali to\'lov qilib, summani shu yerga kiriting. Avtomatik to\'lov keyinroq ulanadi.':
    'Entered manually for now — pay by bank transfer or Payme/Click, then enter the amount here. Automatic payments come later.',

  // ─── Integratsiya ────────────────────────────────────────────────────────
  'Telegram': 'Telegram',
  'Telegram ulangan': 'Telegram connected',
  'Bot ulangan': 'Bot connected',
  'Bot token': 'Bot token',
  'Bot tokeni': 'Bot token',
  'Token': 'Token',
  'Telegram botini ulang': 'Connect the Telegram bot',
  'Qabul qiluvchi chat ID': 'Recipient chat ID',
  'Yuborish vaqti': 'Send time',
  'Oxirgi hisobotlar': 'Recent reports',
  'Oxirgi xato': 'Last error',
  'Sinxron xatosi': 'Sync error',
  'Integratsiya ma\'lumot ololmadi': 'The integration could not fetch data',
  'Transkript modeli': 'Transcription model',
  'Audio yuklashda ishlatiladigan model': 'Model used when uploading audio',
  'To\'liq token hech qachon qaytarilmaydi — bazada shifrlangan holda saqlanadi.':
    'The full token is never returned — it is stored encrypted in the database.',
  '@BotFather orqali bot yarating va token\'ni shu yerga kiriting. Token shifrlangan holda saqlanadi.':
    'Create a bot with @BotFather and paste the token here. The token is stored encrypted.',
  '@BotFather orqali bot yarating va tokenini shu yerga kiriting. Sizning yozishmalaringiz avtomatik yig\'ilib, baholanadi.':
    'Create a bot with @BotFather and paste its token here. Your chats will be collected and scored automatically.',
  'Guruh ID si manfiy bo\'ladi, shaxsiy chat — musbat.':
    'A group ID is negative; a direct chat ID is positive.',
  'Telegram yozishmalari endi avtomatik yig\'iladi va sizning playbook\'ingiz bo\'yicha baholanadi.':
    'Telegram chats are now collected automatically and scored against your playbook.',

  // ─── Onboarding ──────────────────────────────────────────────────────────
  'Biznesingiz haqida': 'About your business',
  'Onboarding qadamlari': 'Setup steps',
  'Sotuvchilaringizni qo\'shing': 'Add your reps',
  'Keyinroq ulayman': 'I\'ll connect later',
  'Oxirgi qadam — webhook': 'Last step — webhook',
  'Namunalarni baholash': 'Score the samples',
  'Hoziroq sinab ko\'ring': 'Try it right now',
  'AI qoralamasi tayyor.': 'The AI draft is ready.',
  'AI natijasi — tekshiring va tasdiqlang': 'AI result — review and confirm',
  'AI baholash mezonlarini tuzmoqda… bu 10-20 soniya oladi':
    'The AI is building your scoring criteria… this takes 10–20 seconds',
  '↻ Qayta generatsiya': '↻ Regenerate',
  '* bilan belgilangan maydonlar to\'ldirilishi shart': 'Fields marked with * are required',
  'Bu ma\'lumot AI baholash mezonlarini tuzishda asos bo\'ladi. Qanchalik aniq yozsangiz, shunchalik mos playbook chiqadi.':
    'This information is the basis for the AI scoring criteria. The more precise you are, the better the playbook fits.',
  '3 ta namunaviy suhbatni yuklaymiz va sizning mezonlaringiz bo\'yicha baholaymiz. Bu haqiqiy tahlil — oldindan yozilgan natija emas.':
    'We load 3 sample conversations and score them against your criteria. This is a real analysis, not a canned result.',
  'Keyinroq ham qo\'shishingiz mumkin. Har birini Telegram profiliga bog\'lash sozlamalarda.':
    'You can add them later. Linking each one to a Telegram profile happens in settings.',
  'Har bir suhbat playbook mezonlari bo\'yicha baholanmoqda. Bu odatda yarim daqiqa oladi.':
    'Each conversation is being scored against the playbook criteria. This usually takes about half a minute.',

  // ─── Playbook ────────────────────────────────────────────────────────────
  'Playbook — har suhbat shu bo\'yicha baholanadi':
    'Playbook — every conversation is scored against it',
  'Bu mezon nimani baholaydi?': 'What does this criterion measure?',
  'Savol matni': 'Question text',
  '+ Kategoriya qo\'shish': '+ Add category',
  '+ Mezon qo\'shish': '+ Add criterion',
  '+ Savol qo\'shish': '+ Add question',
  'Soha lug\'ati': 'Industry vocabulary',
  'Atama kiriting va Enter bosing': 'Type a term and press Enter',
  'Nutqni matnga aylantirishda aniqlik uchun — mahsulot nomlari, brend so\'zlari':
    'Improves speech-to-text accuracy — product names, brand words',
  'Sotuvchi hech qachon qilmasligi kerak bo\'lgan narsalar': 'Things a rep must never do',
  'Suhbatda albatta aniqlanishi kerak bo\'lgan ma\'lumot':
    'Information that must be captured in every conversation',
  'Xatolar topildi:': 'Problems found:',
  'Vaznlar yig\'indisi:': 'Sum of weights:',
  'Ko\'rib chiqing, kerak bo\'lsa tahrirlang — keyin qabul qiling.':
    'Review it, edit if needed — then accept.',

  // ─── Suhbat yuklash ──────────────────────────────────────────────────────
  '＋ Suhbat yuklash': '＋ Upload conversation',
  'Qo\'lda suhbat yuklash': 'Upload a conversation manually',
  'Namuna matnni qo\'yish': 'Paste sample text',
  'Matnni tahrirlash': 'Edit the text',
  'Matnni yozishmadan aynan nusxalang': 'Copy the text from the chat exactly',
  'Avtomatik to\'g\'rilash': 'Auto-correct',
  'Tasdiqlash va matnga o\'tish': 'Confirm and continue to the text',
  'Rollar to\'g\'rimi? Noto\'g\'ri bo\'lsa tahlil ham teskari chiqadi.':
    'Are the roles right? If they are wrong, the analysis will be wrong too.',
  'MP3, WAV, OGG yoki FLAC — 10 MB gacha. M4A qo\'llab-quvvatlanmaydi. Yozuvda ikkala tomon ham eshitilishi kerak, aks holda so\'zlovchilar ajralmaydi.':
    'MP3, WAV, OGG or FLAC — up to 10 MB. M4A is not supported. Both sides must be audible, otherwise the speakers cannot be separated.',
  'Audio yuklanmadi. Fayl mavjud emas yoki formati qo\'llab-quvvatlanmaydi.':
    'The audio could not be loaded. The file is missing or its format is unsupported.',
  'AI kim gapirganini va matn xatolarini tuzatishga urindi. Noto\'g\'ri joy bo\'lsa — "Matnni tahrirlash" orqali keyingi qadamda qo\'lda to\'g\'rilang.':
    'The AI tried to fix who said what and any text errors. If something is wrong, correct it manually in the next step via "Edit the text".',
  '⚠ AI ishlamadi, oddiy kalit-so\'z qoidalari bilan taxminiy ajratildi. Bu ancha xato bo\'lishi mumkin — diqqat bilan tekshiring.':
    '⚠ The AI failed; speakers were split by simple keyword rules. This can be quite wrong — check carefully.',
  'Bo\'sh qoldirilsa — hozirgi vaqt.': 'Left empty — the current time.',
  'Fayl tanlandi:': 'File selected:',

  // ─── Grafiklar va boshqa ─────────────────────────────────────────────────
  'G\'ildirak bilan yaqinlashtiring, sudrab suring': 'Zoom with the wheel, drag to pan',
  'Nuqta rangi — o\'sha kungi o\'rtacha ball': 'Dot color is that day\'s average score',
  'Kunlik dinamika': 'Daily trend',
  'Faollik': 'Activity',
  'Eng yaxshi': 'Best',
  'Intilish kerak': 'Needs work',
  'E\'tibor kerak': 'Needs attention',
  'Hozir ko\'proq uchraydi': 'More frequent now',
  'Raqamlar ortidagi sabab': 'The reason behind the numbers',
  'Suhbatlar sifati': 'Conversation quality',
  'Bir kunning to\'liq kesimi': 'A full cross-section of one day',
  'So\'nggi suhbatlar': 'Recent conversations',
  'So\'nggi tahlillar': 'Recent analyses',
  'Shu kunning zaif mezonlari': 'Weak criteria for this day',
  'Javobsiz va qayta aloqasiz': 'Unanswered and never followed up',
  'Mijoz yozgan, menejer javob bermagan VA tanlangan muddat ichida o\'zi ham bog\'lanmagan holatlar.':
    'Cases where the customer wrote, the rep did not reply, AND did not reach out within the selected window.',
  'Manbani tanlang — quyidagi barcha raqamlar shu tanlovga qarab hisoblanadi.':
    'Pick a source — every number below is computed from that choice.',
  '"Jamoa" ustuni — shu davrda boshqa sotuvchilarning o\'rtachasi. "Aniqlanmadi" ballari o\'rtachaga qo\'shilmaydi.':
    'The "Team" column is the average of the other reps in this period. "Not determined" scores are excluded from the average.',
  '"Aniqlanmadi" ballari foizga qo\'shilmaydi — ular alohida sanaladi.':
    '"Not determined" scores are not counted in the percentage — they are tallied separately.',
  'Bu davrda yetarli baho yo\'q — mezon "asosiy muammo" deb belgilanishi uchun kamida 3 marta baholangan bo\'lishi kerak.':
    'Not enough scores in this period — a criterion must be scored at least 3 times to be marked as a main problem.',
  'Bu davrda yetarli baho yo\'q — prioritet uchun sotuvchida kamida 2 ta baholangan qo\'ng\'iroq bo\'lishi kerak.':
    'Not enough scores in this period — a rep needs at least 2 scored calls to be prioritized.',
  'Bu davrda anketa javobi yig\'ilmagan. Savollarni «Baholash mezonlari» bo\'limida qo\'shishingiz mumkin.':
    'No questionnaire answers were collected in this period. You can add questions in the "Scoring criteria" section.',
  'Foiz 100 dan yuqori — eski davrdan qolgan vazifalar ham yopilgan.':
    'Above 100% — tasks left over from an earlier period were closed as well.',
  'Zaif chiqqan mezonlar — aynan shu bosqichlarda yiqilgan:':
    'The criteria that scored weakest — these are the stages where it broke down:',

  // ─── Mijoz anketasi ──────────────────────────────────────────────────────
  'Mijoz turi': 'Customer type',
  'Mijozingiz kim? *': 'Who is your customer? *',
  'Mijoz qanday muammo bilan keladi? *': 'What problem do customers come with? *',
  'Biznesingiz nima bilan shug\'ullanadi? *': 'What does your business do? *',
  'Asosiy mahsulot/xizmatlaringiz *': 'Your main products/services *',
  'Eng ko\'p uchraydigan e\'tirozlar *': 'Most common objections *',
  'Qaror qabul qiluvchi': 'Decision maker',
  'qaror qiluvchi': 'decision maker',
  'Ikkalasi ham': 'Both',
  'Mijoz murojaati': 'Customer request',
  'Aloqa o\'rnatilgan': 'Contact established',
  'Suhbat bor': 'Has conversation',
};
