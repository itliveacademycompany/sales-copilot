import { and, eq, inArray } from 'drizzle-orm';
import { withTenant } from '../db/index.js';
import { conversation, seat, task } from '../db/schema/index.js';
import { enqueueAnalysis } from '../jobs/queue.js';
import { ingestMessage } from '../telegram/ingest.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FR-16 — NAMUNAVIY SUHBATLAR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * TZ 3.2: "Test rejimi: 3 ta namunaviy suhbatni yuklab, natijani darhol
 * ko'rish" (P0). Bu onboardingdagi eng muhim qadam: mijoz o'z Telegramini
 * ulab, birinchi haqiqiy suhbatni kutmasdan mahsulot NIMA berishini ko'radi.
 *
 * Muhim: namunalar oldindan "bahosi yozilgan" emas. Ular HAQIQIY quvurdan
 * o'tadi — mijozning o'z playbook'i bo'yicha baholanadi. Shuning uchun
 * mijoz ko'rgan natija haqiqiy: agar playbook zaif bo'lsa, u ham ko'rinadi.
 *
 * Namunalar `sample-` prefiksli chat id bilan yoziladi — keyin ajratib
 * o'chirish mumkin va haqiqiy yozishmalarga aralashmaydi.
 */

const NAMUNA_PREFIX = 'sample-';
const NAMUNA_SEAT_TG = 'sample-manager';
const DAQIQA = 60_000;

interface NamunaSuhbat {
  chatId: string;
  mijozTgId: string;
  soatOldin: number;
  xabarlar: { kim: 'manager' | 'client'; matn: string; sekund: number }[];
}

/**
 * Uchta namuna ataylab uch xil natija beradi: kuchli suhbat, o'rtacha
 * (ehtiyoj aniqlanmagan) va zaif (e'tiroz ishlanmagan). Shunda mijoz
 * shkalaning butun diapazonini bir qarashda ko'radi.
 */
const NAMUNALAR: NamunaSuhbat[] = [
  {
    chatId: `${NAMUNA_PREFIX}1`,
    mijozTgId: 'sample-client-1',
    soatOldin: 26,
    xabarlar: [
      { kim: 'client', matn: 'Assalomu alaykum, kurslaringiz haqida bilsam bo\'ladimi?', sekund: 0 },
      {
        kim: 'manager',
        matn: 'Assalomu alaykum! Men Nodira, o\'quv markazidanman. Albatta aytaman. Avval bilsam — o\'zingiz uchunmi yoki farzandingizgami?',
        sekund: 120,
      },
      { kim: 'client', matn: 'O\'g\'lim uchun, 14 yoshda', sekund: 300 },
      {
        kim: 'manager',
        matn: 'Juda yaxshi yosh. O\'g\'lingiz hozir nima bilan qiziqadi — o\'yin o\'ynashnimi, rasm chizishnimi, robotlarnimi? Shunga qarab yo\'nalish tanlaymiz.',
        sekund: 420,
      },
      { kim: 'client', matn: 'O\'yin o\'ynashni yaxshi ko\'radi, kompyuterda ko\'p o\'tiradi', sekund: 700 },
      {
        kim: 'manager',
        matn: 'Unda "O\'yin dasturlash" yo\'nalishi juda mos keladi — bolalar o\'zi o\'ynaydigan o\'yinni yaratishni o\'rganadi, bu ularni juda qiziqtiradi. Kurs 8 oy, haftada 3 kun. Narxi oyiga 850 ming so\'m.',
        sekund: 900,
      },
      { kim: 'client', matn: 'Qimmatroq ekan...', sekund: 1300 },
      {
        kim: 'manager',
        matn: 'Tushunaman. Shuni aytay: narxga kompyuter, mentor va yakuniy loyiha kiradi — qo\'shimcha to\'lov yo\'q. O\'tgan guruhdan 3 ta bola o\'z o\'yinini Play Marketga chiqargan. Bepul IT-diagnostika darsiga keling, o\'g\'lingiz sinab ko\'rsin, keyin qaror qilasiz. Shanba soat 15:00 qulaymi?',
        sekund: 1500,
      },
      { kim: 'client', matn: 'Mayli, shanba kelamiz', sekund: 1900 },
      {
        kim: 'manager',
        matn: 'Ajoyib! Manzilni Telegramga tashlab qo\'yaman, juma kuni eslatib qo\'ngiroq qilaman.',
        sekund: 2000,
      },
    ],
  },
  {
    chatId: `${NAMUNA_PREFIX}2`,
    mijozTgId: 'sample-client-2',
    soatOldin: 20,
    xabarlar: [
      { kim: 'client', matn: 'Salom. SMM kursi bormi?', sekund: 0 },
      { kim: 'manager', matn: 'Salom! Ha, bor. 3 oylik kurs, oyiga 900 ming so\'m.', sekund: 240 },
      { kim: 'client', matn: 'Nimalarni o\'rgatasiz?', sekund: 500 },
      {
        kim: 'manager',
        matn: 'Instagram, Telegram, target reklama, kontent rejasi. Dush-chor-juma 18:00 da.',
        sekund: 640,
      },
      { kim: 'client', matn: 'Tushunarli, o\'ylab ko\'raman', sekund: 900 },
      { kim: 'manager', matn: 'Yaxshi, kutamiz.', sekund: 1000 },
    ],
  },
  {
    chatId: `${NAMUNA_PREFIX}3`,
    mijozTgId: 'sample-client-3',
    soatOldin: 5,
    xabarlar: [
      { kim: 'client', matn: 'Kechirasiz, kurs narxi qancha edi?', sekund: 0 },
      { kim: 'manager', matn: 'Oyiga 1 mln 200 ming so\'m.', sekund: 180 },
      { kim: 'client', matn: 'Juda qimmat-ku. Boshqa joyda 600 mingga bor ekan', sekund: 400 },
      { kim: 'manager', matn: 'Bizda sifat yaxshi.', sekund: 900 },
      { kim: 'client', matn: 'Tushunarli. Rahmat', sekund: 1100 },
    ],
  },
];

export interface NamunaNatija {
  yaratildi: number;
  navbatga: number;
  suhbatIdlari: string[];
}

/**
 * Namunalarni yozadi va tahlilga qo'yadi.
 *
 * Idempotent: qayta chaqirilsa eski namunalar o'chiriladi. Mijozning
 * haqiqiy yozishmalariga tegilmaydi — faqat `sample-` prefiksli chatlar.
 */
export async function namunalarniYuklash(businessId: string): Promise<NamunaNatija> {
  const chatIdlar = NAMUNALAR.map((n) => n.chatId);

  // ─── 1. Eski namunalarni tozalash ───
  await withTenant(businessId, async (tx) => {
    const eski = await tx
      .select({ id: conversation.id })
      .from(conversation)
      .where(inArray(conversation.externalThreadId, chatIdlar));
    if (eski.length === 0) return;
    const idlar = eski.map((e) => e.id);
    // task.conversation_id `set null` bo'lgani uchun avval o'zimiz olib tashlaymiz
    await tx.delete(task).where(inArray(task.conversationId, idlar));
    await tx.delete(conversation).where(inArray(conversation.id, idlar));
  });

  // ─── 2. Namuna menejeri (xabar "menejer" deb tanilishi uchun seat kerak) ───
  await withTenant(businessId, async (tx) => {
    const [bor] = await tx
      .select({ id: seat.id })
      .from(seat)
      .where(eq(seat.telegramId, NAMUNA_SEAT_TG))
      .limit(1);
    if (bor) return;
    await tx.insert(seat).values({
      businessId,
      displayName: 'Namuna menejeri',
      telegramId: NAMUNA_SEAT_TG,
      telegramLinked: true,
      isActive: true,
    });
  });

  // ─── 3. Xabarlarni yozish ───
  const hozir = Date.now();
  let msgId = hozir % 1_000_000;
  for (const n of NAMUNALAR) {
    const boshlanish = hozir - n.soatOldin * 60 * DAQIQA;
    for (const x of n.xabarlar) {
      await ingestMessage({
        businessId,
        chatId: n.chatId,
        messageId: `sample-${msgId++}`,
        senderId: x.kim === 'manager' ? NAMUNA_SEAT_TG : n.mijozTgId,
        senderIsBot: false,
        text: x.matn,
        sentAt: new Date(boshlanish + x.sekund * 1000),
      });
    }
  }

  // ─── 4. Tahlilga qo'yish (haqiqiy quvur, mijozning o'z playbook'i bilan) ───
  const yaratilgan = await withTenant(businessId, (tx) =>
    tx
      .select({ id: conversation.id })
      .from(conversation)
      .where(
        and(
          inArray(conversation.externalThreadId, chatIdlar),
          eq(conversation.status, 'received'),
        ),
      ),
  );

  let navbatga = 0;
  for (const c of yaratilgan) {
    const natija = await enqueueAnalysis(businessId, c.id);
    if (natija.queued) navbatga++;
  }

  return {
    yaratildi: yaratilgan.length,
    navbatga,
    suhbatIdlari: yaratilgan.map((c) => c.id),
  };
}
