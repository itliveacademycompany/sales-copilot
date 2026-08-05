import { and, desc, eq, sql } from 'drizzle-orm';
import { withTenant, type Tx } from '../db/index.js';
import { contact, conversation, seat, transcriptSegment } from '../db/schema/index.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TELEGRAM XABARLARINI YIG'ISH VA SESSIYAGA BO'LISH
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Qo'ng'iroqda suhbat chegarasi tabiiy: go'shak ko'tarilib, qo'yiladi.
 * Telegram'da bunday chegara yo'q — bir xil ikki odam oylab yozishadi.
 * Shuning uchun oqimni sun'iy ravishda sessiyalarga bo'lamiz.
 *
 * QOIDA: oxirgi xabardan `SESSION_GAP_MS` o'tgan bo'lsa — yangi sessiya.
 *
 * Nega 24 soat: sotuvda tabiiy tsikl kunlik. Ertalab yozib, kechqurun
 * javob olish — bitta suhbat. Ertasi kuni yozish — yangi urinish, uni
 * alohida baholash to'g'ri.
 */
const SESSION_GAP_MS = 24 * 60 * 60 * 1000;

export interface IncomingMessage {
  businessId: string;
  /** Telegram chat id — oqim identifikatori. */
  chatId: string;
  /** Telegram message_id — dedupe kaliti. */
  messageId: string;
  /** Yuboruvchining Telegram user id si. */
  senderId: string | null;
  senderIsBot: boolean;
  text: string;
  sentAt: Date;
  chatTitle?: string | undefined;
}

export interface IngestResult {
  status: 'stored' | 'duplicate' | 'ignored';
  conversationId?: string;
  /** Yangi sessiya ochildimi yoki mavjudiga qo'shildimi. */
  newSession?: boolean;
  reason?: string;
}

/**
 * Speaker rolini aniqlash — FR-84.
 *
 * Telegram'da bu **deterministik**: yuboruvchining user id si seat'ga
 * biriktirilgan bo'lsa — menejer, aks holda — mijoz. Hech qanday taxmin,
 * hech qanday LLM. Audio quvurlarida uchraydigan ~5% rol almashish xatosi
 * bu yerda tamoman mumkin emas.
 */
async function resolveSpeaker(
  tx: Tx,
  senderId: string | null,
): Promise<{ speaker: 'manager' | 'client'; seatId: string | null }> {
  if (!senderId) return { speaker: 'client', seatId: null };

  const [match] = await tx
    .select({ id: seat.id })
    .from(seat)
    .where(and(eq(seat.telegramId, senderId), eq(seat.isActive, true)))
    .limit(1);

  return match
    ? { speaker: 'manager', seatId: match.id }
    : { speaker: 'client', seatId: null };
}

/**
 * Kontaktni topadi yoki yaratadi — FR-112 atrofidagi "bu mijoz bilan
 * oldingi suhbatlar" kouching konteksti shunga tayanadi.
 *
 * Telegram xususiy chatida `chatId` = mijozning shaxsiy Telegram id'si,
 * shuning uchun aynan shuni kalit qilib olamiz (yuboruvchi id emas —
 * guruh chatlarida ko'p yuboruvchi bo'lishi mumkin, lekin bitta chat
 * bitta "mijoz" sifatida qaraladi).
 */
async function resolveContact(tx: Tx, businessId: string, chatId: string, seenAt: Date): Promise<string> {
  const [row] = await tx
    .insert(contact)
    .values({ businessId, telegramId: chatId, firstSeenAt: seenAt, lastSeenAt: seenAt })
    .onConflictDoUpdate({
      target: [contact.businessId, contact.telegramId],
      set: { lastSeenAt: seenAt },
    })
    .returning({ id: contact.id });
  return row!.id;
}

/**
 * Oqimning ochiq sessiyasini topadi yoki yangisini ochadi.
 *
 * Bir vaqtda ikkita xabar kelsa, ikkalasi ham "sessiya yo'q" deb hisoblab
 * ikkita suhbat yaratishi mumkin edi. Buni oldini olish uchun oqim bo'yicha
 * maslahat qulfi (advisory lock) qo'yamiz — u tranzaksiya oxirida
 * avtomatik bo'shaydi va faqat shu chatni bloklaydi.
 */
async function findOrCreateSession(
  tx: Tx,
  msg: IncomingMessage,
): Promise<{ id: string; isNew: boolean; startedAt: Date }> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`${msg.businessId}:tg:${msg.chatId}`}))`,
  );

  const [last] = await tx
    .select({
      id: conversation.id,
      endedAt: conversation.endedAt,
      startedAt: conversation.startedAt,
    })
    .from(conversation)
    .where(
      and(
        eq(conversation.channel, 'telegram'),
        eq(conversation.externalThreadId, msg.chatId),
      ),
    )
    .orderBy(desc(conversation.startedAt))
    .limit(1);

  if (last) {
    const lastActivity = (last.endedAt ?? last.startedAt).getTime();
    if (msg.sentAt.getTime() - lastActivity < SESSION_GAP_MS) {
      return { id: last.id, isNew: false, startedAt: last.startedAt };
    }
  }

  const [created] = await tx
    .insert(conversation)
    .values({
      businessId: msg.businessId,
      channel: 'telegram',
      direction: 'na',
      externalSource: 'telegram_bot',
      // Sessiya identifikatori: chat + boshlanish vaqti. Takrorlanmaydi.
      externalId: `tg:${msg.chatId}:${msg.sentAt.getTime()}`,
      externalThreadId: msg.chatId,
      startedAt: msg.sentAt,
      endedAt: msg.sentAt,
      status: 'received',
    })
    .returning({ id: conversation.id });

  if (!created) throw new Error('suhbat sessiyasi yaratilmadi');
  return { id: created.id, isNew: true, startedAt: msg.sentAt };
}

/**
 * Bitta xabarni saqlash.
 *
 * Idempotent: Telegram webhook'ni qayta yuborishi odatiy hol (biz 200
 * qaytarmaguncha u soatlab urinadi). Takroriy xabar unikal indeksga
 * urilib, jim ravishda `duplicate` sifatida qaytadi.
 */
export async function ingestMessage(msg: IncomingMessage): Promise<IngestResult> {
  // Botlarning o'z xabarlari — bu bizning avtomatik javoblarimiz yoki
  // boshqa botlar. Sotuv suhbati emas.
  if (msg.senderIsBot) {
    return { status: 'ignored', reason: 'bot xabari' };
  }
  if (!msg.text.trim()) {
    return { status: 'ignored', reason: 'bo\'sh xabar' };
  }

  return withTenant(msg.businessId, async (tx) => {
    const session = await findOrCreateSession(tx, msg);
    const { speaker, seatId } = await resolveSpeaker(tx, msg.senderId);
    const contactId = await resolveContact(tx, msg.businessId, msg.chatId, msg.sentAt);

    const [seqRow] = await tx
      .select({ nextSeq: sql<number>`coalesce(max(${transcriptSegment.seq}), -1) + 1` })
      .from(transcriptSegment)
      .where(eq(transcriptSegment.conversationId, session.id));
    const nextSeq = seqRow?.nextSeq ?? 0;

    /**
     * `onConflictDoNothing` — istisno emas.
     *
     * PostgreSQL'da unikal cheklov buzilsa **butun tranzaksiya bekor
     * bo'ladi**, shuning uchun xatoni ushlab "duplicate" deb qaytarish
     * ishlamaydi: keyingi COMMIT baribir yiqiladi. Buni test tutdi —
     * takroriy webhook 500 ga aylanardi va Telegram uni soatlab
     * qayta yuboraverardi.
     */
    const inserted = await tx
      .insert(transcriptSegment)
      .values({
        conversationId: session.id,
        businessId: msg.businessId,
        seq: nextSeq,
        speaker,
        text: msg.text,
        /**
         * Xabar vaqti — sessiya boshidan o'tgan soniyalar.
         *
         * Qo'ng'iroq bilan bir xil model: FR-81 da "07:12 da siz shunday
         * dedingiz" deyish uchun va javob tezligi metrikalari (FR-45)
         * uchun haqiqiy vaqt kerak. `createdAt` yaramaydi — webhook
         * kechikishi mumkin, `sentAt` esa Telegram'ning o'zi bergan vaqt.
         */
        startSeconds: (
          Math.max(0, msg.sentAt.getTime() - session.startedAt.getTime()) / 1000
        ).toFixed(2),
        externalId: `tg:${msg.chatId}:${msg.messageId}`,
        externalSenderId: msg.senderId,
      })
      .onConflictDoNothing({
        target: [transcriptSegment.businessId, transcriptSegment.externalId],
      })
      .returning({ id: transcriptSegment.id });

    if (inserted.length === 0) {
      return { status: 'duplicate' as const, conversationId: session.id };
    }

    // Sessiya oxirini va sotuvchi biriktirilishini yangilaymiz.
    // Holat 'received' ga qaytadi: suhbat allaqachon tahlil qilingan bo'lsa
    // ham, yangi xabar kelgach u eskirdi — scheduler jimlik tugagach uni
    // qayta navbatga qo'yadi (FR-85 ning avtomatik varianti).
    await tx
      .update(conversation)
      .set({
        endedAt: msg.sentAt,
        status: 'received',
        contactId,
        ...(seatId ? { seatId } : {}),
        updatedAt: new Date(),
      })
      .where(eq(conversation.id, session.id));

    return {
      status: 'stored' as const,
      conversationId: session.id,
      newSession: session.isNew,
    };
  });
}

/**
 * Sessiyaning javob tezligi ko'rsatkichlari — FR-45.
 *
 * Telegram'da bu eng muhim KPI. Javob tezligini alohida SLA metrikasi
 * sifatida ko'rsatish kam narsa beradi — biz uni suhbat sifati bahosi
 * bilan birga beramiz, chunki tez javob bergan sotuvchi yomon sotgan
 * bo'lishi ham mumkin.
 *
 * Hisoblash: mijoz xabaridan keyingi birinchi menejer xabarigacha o'tgan
 * vaqt. Mijozning ketma-ket bir nechta xabari bitta "navbat" sanaladi —
 * javob birinchisidan boshlab o'lchanadi, oxirgisidan emas.
 */
export interface ReplyMetrics {
  customerTurns: number;
  repliedTurns: number;
  unansweredTurns: number;
  firstResponseSeconds: number | null;
  medianResponseSeconds: number | null;
  slowestResponseSeconds: number | null;
}

export function computeReplyMetrics(
  segments: { speaker: string; at: Date }[],
): ReplyMetrics {
  const responses: number[] = [];
  let customerTurns = 0;
  let unanswered = 0;
  let firstResponse: number | null = null;
  let pendingSince: Date | null = null;

  for (const seg of segments) {
    if (seg.speaker === 'client') {
      // Navbat allaqachon ochiq bo'lsa, yangisini boshlamaymiz.
      if (pendingSince === null) {
        pendingSince = seg.at;
        customerTurns++;
      }
      continue;
    }

    if (seg.speaker === 'manager' && pendingSince !== null) {
      const seconds = (seg.at.getTime() - pendingSince.getTime()) / 1000;
      responses.push(seconds);
      firstResponse ??= seconds;
      pendingSince = null;
    }
  }

  if (pendingSince !== null) unanswered = 1;

  const sorted = [...responses].sort((a, b) => a - b);
  const median =
    sorted.length === 0
      ? null
      : sorted.length % 2 === 1
        ? sorted[(sorted.length - 1) / 2]!
        : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2;

  return {
    customerTurns,
    repliedTurns: responses.length,
    unansweredTurns: unanswered,
    firstResponseSeconds: firstResponse,
    medianResponseSeconds: median,
    slowestResponseSeconds: sorted.length ? sorted[sorted.length - 1]! : null,
  };
}
