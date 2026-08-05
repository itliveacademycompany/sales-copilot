import { and, asc, desc, eq, inArray, lt, ne, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant, withoutTenantIsolation } from '../../db/index.js';
import {
  analysis,
  appUser,
  commitment,
  contact,
  conversation,
  conversationComment,
  criterionScore,
  playbook,
  scoreAppeal,
  seat,
  transcriptSegment,
} from '../../db/schema/index.js';
import { enqueueAnalysis } from '../../jobs/queue.js';
import { requireBusiness, requirePermission } from '../auth-plugin.js';
import { assertSeatAllowed, conversationScope, seatFilter } from '../scope.js';
import { AppError } from '../errors.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SUHBATLAR API — ro'yxat, detal (transkript + ballar + isbot), qayta tahlil
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Detal javobida har ball o'z isboti bilan keladi (iqtibos + segment +
 * vaqt) — frontend ballga bosilganda transkriptning aynan o'sha joyiga
 * o'tadi (FR-81). Bu mahsulotning asosiy farqi.
 */

const listQuery = z.object({
  status: z
    .enum(['received', 'filtered', 'queued', 'transcribing', 'analyzing', 'done', 'failed'])
    .optional(),
  seatId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  /** Kursor: shu vaqtdan eski suhbatlar (startedAt bo'yicha). */
  before: z.coerce.date().optional(),
});

export function registerConversationRoutes(app: FastifyInstance): void {
  app.get(
    '/api/v1/businesses/:businessId/conversations',
    // Ruxsat `conversationScope` ichida tekshiriladi: rahbar hammasini,
    // sotuvchi faqat o'zinikini ko'radi (FR-112).
    { preHandler: [requireBusiness] },
    async (req) => {
      const q = listQuery.parse(req.query);
      const businessId = req.business!.businessId;
      const onlySeat = seatFilter(conversationScope(req), q.seatId);

      const rows = await withTenant(businessId, (tx) =>
        tx
          .select({
            id: conversation.id,
            channel: conversation.channel,
            seatId: conversation.seatId,
            externalThreadId: conversation.externalThreadId,
            startedAt: conversation.startedAt,
            endedAt: conversation.endedAt,
            status: conversation.status,
            excludedReason: conversation.excludedReason,
            language: conversation.language,
            // Tahlil xulosasi ro'yxatda ko'rinadi — detalga kirmasdan.
            overallScore: analysis.overallScore,
            leadQuality: analysis.leadQuality,
            primaryGap: analysis.primaryGap,
            summary: analysis.summary,
            isFlagged: analysis.isFlagged,
            scoringMode: analysis.scoringMode,
            segmentCount: sql<number>`(
              select count(*)::int from transcript_segment ts
              where ts.conversation_id = ${conversation.id}
            )`,
          })
          .from(conversation)
          .leftJoin(analysis, eq(analysis.conversationId, conversation.id))
          .where(
            and(
              q.status ? eq(conversation.status, q.status) : undefined,
              onlySeat ? eq(conversation.seatId, onlySeat) : undefined,
              q.before ? lt(conversation.startedAt, q.before) : undefined,
            ),
          )
          .orderBy(desc(conversation.startedAt))
          .limit(q.limit),
      );

      const last = rows[rows.length - 1];
      return {
        conversations: rows,
        nextCursor: rows.length === q.limit && last ? last.startedAt : null,
      };
    },
  );

  app.get(
    '/api/v1/businesses/:businessId/conversations/:conversationId',
    { preHandler: [requireBusiness] },
    async (req) => {
      const { conversationId } = z
        .object({ businessId: z.string().uuid(), conversationId: z.string().uuid() })
        .parse(req.params);
      const businessId = req.business!.businessId;
      const scope = conversationScope(req);

      const result = await withTenant(businessId, async (tx) => {
        const [conv] = await tx
          .select({
            id: conversation.id,
            businessId: conversation.businessId,
            seatId: conversation.seatId,
            contactId: conversation.contactId,
            channel: conversation.channel,
            direction: conversation.direction,
            externalThreadId: conversation.externalThreadId,
            startedAt: conversation.startedAt,
            endedAt: conversation.endedAt,
            phoneFrom: conversation.phoneFrom,
            phoneTo: conversation.phoneTo,
            status: conversation.status,
            excludedReason: conversation.excludedReason,
            isOffHours: conversation.isOffHours,
            language: conversation.language,
            managerName: seat.displayName,
            // Media — FAZA 2 (audio yuklash + STT) uchun. FAZA 1 Telegram
            // matnida bu maydonlar null bo'ladi va UI pleyerni ko'rsatmaydi.
            mediaUrl: conversation.mediaUrl,
            mediaKind: conversation.mediaKind,
            durationSeconds: conversation.durationSeconds,
          })
          .from(conversation)
          .leftJoin(seat, eq(seat.id, conversation.seatId))
          .where(eq(conversation.id, conversationId))
          .limit(1);
        if (!conv) return null;
        // Begona sotuvchining suhbati — 404 (403 emas).
        assertSeatAllowed(scope, conv.seatId);

        const segments = await tx
          .select({
            id: transcriptSegment.id,
            seq: transcriptSegment.seq,
            speaker: transcriptSegment.speaker,
            text: transcriptSegment.text,
            startSeconds: transcriptSegment.startSeconds,
          })
          .from(transcriptSegment)
          .where(eq(transcriptSegment.conversationId, conversationId))
          .orderBy(asc(transcriptSegment.seq));

        const [a] = await tx
          .select()
          .from(analysis)
          .where(eq(analysis.conversationId, conversationId))
          .limit(1);

        /**
         * `criterion_score` faqat kategoriya KODINI saqlaydi (A, B...),
         * nomini emas. Kod frontend'da "A" degan harf o'rniga "Ehtiyoj
         * aniqlash" ko'rsatishi uchun, baholashda ishlatilgan playbook
         * VERSIYASIDAN (joriy faol versiyadan emas — u o'zgargan bo'lishi
         * mumkin) kategoriya nomlarini olamiz.
         */
        let categoryNames: Record<string, string> = {};
        if (a?.playbookId) {
          const [pb] = await tx
            .select({ criteria: playbook.criteria })
            .from(playbook)
            .where(eq(playbook.id, a.playbookId))
            .limit(1);
          const categories = (pb?.criteria as { categories?: { code: string; name: string }[] } | undefined)
            ?.categories;
          if (categories) {
            categoryNames = Object.fromEntries(categories.map((c) => [c.code, c.name]));
          }
        }

        const scores = a
          ? await tx
              .select({
                // FR-124: e'tiroz aynan shu ball qatoriga bog'lanadi.
                id: criterionScore.id,
                criterionCode: criterionScore.criterionCode,
                criterionName: criterionScore.criterionName,
                categoryCode: criterionScore.categoryCode,
                categoryWeightPct: criterionScore.categoryWeightPct,
                rubricSnapshot: criterionScore.rubricSnapshot,
                score: criterionScore.score,
                maxScore: criterionScore.maxScore,
                evidenceQuote: criterionScore.evidenceQuote,
                evidenceStartSeconds: criterionScore.evidenceStartSeconds,
                evidenceSegmentId: criterionScore.evidenceSegmentId,
                confidence: criterionScore.confidence,
              })
              .from(criterionScore)
              .where(eq(criterionScore.analysisId, a.id))
              .orderBy(asc(criterionScore.criterionCode))
          : [];

        const commitments = await tx
          .select({
            id: commitment.id,
            byParty: commitment.byParty,
            what: commitment.what,
            deadline: commitment.deadline,
            status: commitment.status,
          })
          .from(commitment)
          .where(eq(commitment.conversationId, conversationId))
          .orderBy(asc(commitment.createdAt));

        // FR-112 kouching konteksti: shu mijoz bilan bo'lgan boshqa
        // suhbatlar — "bu birinchi murojaatmi yoki takroriymi" darhol
        // ko'rinadi, va sotuvchi oldingi va'dalarni eslab qoladi.
        let contactInfo: {
          id: string;
          name: string | null;
          company: string | null;
          role: string | null;
          isDecisionMaker: boolean | null;
        } | null = null;
        let previousConversations: {
          id: string;
          startedAt: Date;
          overallScore: string | null;
          summary: string | null;
        }[] = [];

        if (conv.contactId) {
          const [c] = await tx
            .select({
              id: contact.id,
              name: contact.name,
              company: contact.company,
              role: contact.role,
              isDecisionMaker: contact.isDecisionMaker,
            })
            .from(contact)
            .where(eq(contact.id, conv.contactId))
            .limit(1);
          contactInfo = c ?? null;

          // Faqat HAQIQATAN oldinroq boshlangan suhbatlar — "bu kontakt
          // bilan oldingi suhbatlar" degani vaqtinchalik jihatdan keyin
          // sodir bo'lgan suhbatni ko'rsatmasligi kerak (masalan, sotuvchi
          // eski suhbatni ochsa, undan keyingi suhbat "oldingi" bo'lib
          // ko'rinib chalkashtirmasin).
          previousConversations = await tx
            .select({
              id: conversation.id,
              startedAt: conversation.startedAt,
              overallScore: analysis.overallScore,
              summary: analysis.summary,
            })
            .from(conversation)
            .leftJoin(analysis, eq(analysis.conversationId, conversation.id))
            .where(
              and(
                eq(conversation.contactId, conv.contactId),
                ne(conversation.id, conversationId),
                lt(conversation.startedAt, conv.startedAt),
              ),
            )
            .orderBy(desc(conversation.startedAt))
            .limit(5);
        }

        // FR-123: rahbar izohlari. FR-124: ochiq e'tirozlar — sotuvchi
        // "men allaqachon shikoyat qildim" deb bilishi kerak, aks holda
        // takror yozadi va rad javobini oladi.
        const comments = await tx
          .select({
            id: conversationComment.id,
            body: conversationComment.body,
            criterionCode: conversationComment.criterionCode,
            authorId: conversationComment.authorId,
            seenAt: conversationComment.seenAt,
            createdAt: conversationComment.createdAt,
          })
          .from(conversationComment)
          .where(eq(conversationComment.conversationId, conversationId))
          .orderBy(asc(conversationComment.createdAt));

        const appeals = await tx
          .select({
            id: scoreAppeal.id,
            criterionScoreId: scoreAppeal.criterionScoreId,
            status: scoreAppeal.status,
            reason: scoreAppeal.reason,
            // Ball o'zgarishini ko'rsatish uchun ikkalasi ham kerak:
            // "3 → 3" e'tiroz behuda bo'lganini, "1 → 3" esa AI xato
            // qilganini aytadi. Ularsiz sotuvchi natijani ko'ra olmaydi.
            originalScore: scoreAppeal.originalScore,
            newScore: scoreAppeal.newScore,
            resolutionNote: scoreAppeal.resolutionNote,
            createdAt: scoreAppeal.createdAt,
            resolvedAt: scoreAppeal.resolvedAt,
          })
          .from(scoreAppeal)
          .where(eq(scoreAppeal.conversationId, conversationId))
          .orderBy(desc(scoreAppeal.createdAt));

        return {
          conv,
          segments,
          analysis: a ?? null,
          scores,
          commitments,
          contact: contactInfo,
          previousConversations,
          categoryNames,
          comments,
          appeals,
        };
      });

      if (!result) throw AppError.notFound();

      // Izoh mualliflarining ismlari — `app_user` tenant jadvali emas.
      const authorIds = [
        ...new Set(result.comments.map((c) => c.authorId).filter((v): v is string => !!v)),
      ];
      const authors = authorIds.length
        ? await withoutTenantIsolation('suhbat izohlari: muallif ismi', (tx) =>
            tx
              .select({ id: appUser.id, displayName: appUser.displayName })
              .from(appUser)
              .where(inArray(appUser.id, authorIds)),
          )
        : [];
      const authorById = new Map(authors.map((u) => [u.id, u.displayName]));

      return {
        conversation: result.conv,
        segments: result.segments.map((s) => ({ ...s, id: String(s.id) })),
        analysis: result.analysis,
        scores: result.scores.map((s) => ({
          ...s,
          id: String(s.id),
          evidenceSegmentId:
            s.evidenceSegmentId === null ? null : String(s.evidenceSegmentId),
        })),
        commitments: result.commitments,
        contact: result.contact,
        previousConversations: result.previousConversations,
        categoryNames: result.categoryNames,
        comments: result.comments.map((c) => ({
          ...c,
          authorName: authorById.get(c.authorId ?? '') ?? null,
        })),
        appeals: result.appeals.map((a) => ({
          ...a,
          criterionScoreId: String(a.criterionScoreId),
        })),
      };
    },
  );

  /**
   * FR-123: rahbardan sotuvchiga qo'lda izoh.
   *
   * AI kouchingi playbook mezonlari doirasida gapiradi. Rahbar esa
   * kontekstni biladi — "bu mijoz bilan o'tgan safar ham shunday bo'lgan".
   * Shu ikkisi bir-birini almashtirmaydi, shuning uchun ikkalasi ham bor.
   *
   * Huquq `task:manage:all` bo'ylab beriladi: kimki jamoaga vazifa
   * qo'ya olsa, kouching izohi ham qoldira oladi. Sotuvchi izoh yoza
   * olmaydi — bu muhokama emas, kouching kanali (u e'tiroz uchun
   * FR-124 dan foydalanadi).
   */
  app.post(
    '/api/v1/businesses/:businessId/conversations/:conversationId/comments',
    { preHandler: [requireBusiness, requirePermission('task:manage:all')] },
    async (req, reply) => {
      const { conversationId } = z
        .object({ businessId: z.string().uuid(), conversationId: z.string().uuid() })
        .parse(req.params);
      const body = z
        .object({
          body: z.string().trim().min(2, 'Izoh bo\'sh bo\'lmasin').max(4000),
          criterionCode: z.string().trim().max(16).nullable().optional(),
        })
        .parse(req.body);
      const businessId = req.business!.businessId;

      const created = await withTenant(businessId, async (tx) => {
        const [conv] = await tx
          .select({ id: conversation.id, seatId: conversation.seatId })
          .from(conversation)
          .where(eq(conversation.id, conversationId))
          .limit(1);
        if (!conv) throw AppError.notFound();

        const [row] = await tx
          .insert(conversationComment)
          .values({
            businessId,
            conversationId,
            seatId: conv.seatId,
            authorId: req.auth!.user.id,
            body: body.body,
            criterionCode: body.criterionCode ?? null,
          })
          .returning();
        return row!;
      });

      reply.status(201);
      return { ...created, authorName: req.auth!.user.displayName };
    },
  );

  /**
   * Sotuvchi izohni o'qiganini belgilaydi.
   *
   * Kouching o'qilmasa u bo'lmagani bilan barobar — rahbar buni
   * ko'rib turishi kerak. Shuning uchun `seen_at` alohida saqlanadi.
   */
  app.patch(
    '/api/v1/businesses/:businessId/comments/:commentId/seen',
    { preHandler: [requireBusiness] },
    async (req) => {
      const { commentId } = z
        .object({ businessId: z.string().uuid(), commentId: z.string().uuid() })
        .parse(req.params);
      const businessId = req.business!.businessId;
      const scope = conversationScope(req);

      return withTenant(businessId, async (tx) => {
        const [row] = await tx
          .select({ id: conversationComment.id, seatId: conversationComment.seatId })
          .from(conversationComment)
          .where(eq(conversationComment.id, commentId))
          .limit(1);
        if (!row) throw AppError.notFound();
        assertSeatAllowed(scope, row.seatId);

        const [updated] = await tx
          .update(conversationComment)
          .set({ seenAt: new Date(), updatedAt: new Date() })
          .where(eq(conversationComment.id, commentId))
          .returning({ id: conversationComment.id, seenAt: conversationComment.seenAt });
        return updated!;
      });
    },
  );

  /**
   * FR-85: qayta tahlil. Playbook o'zgargach yoki ball bahsli bo'lsa
   * qo'lda chaqiriladi. Har chaqiruv pul (LLM) — shuning uchun huquq
   * playbook:write darajasida, oddiy o'qish emas.
   */
  app.post(
    '/api/v1/businesses/:businessId/conversations/:conversationId/analyze',
    { preHandler: [requireBusiness, requirePermission('playbook:write')] },
    async (req, reply) => {
      const { conversationId } = z
        .object({ businessId: z.string().uuid(), conversationId: z.string().uuid() })
        .parse(req.params);
      const businessId = req.business!.businessId;

      const updated = await withTenant(businessId, (tx) =>
        tx
          .update(conversation)
          .set({ status: 'queued', updatedAt: new Date() })
          .where(eq(conversation.id, conversationId))
          .returning({ id: conversation.id }),
      );
      if (updated.length === 0) throw AppError.notFound();

      const result = await enqueueAnalysis(businessId, conversationId);
      if (result.reason === 'billing_blocked') {
        throw AppError.paymentRequired(
          'Obuna faol emas — yangi tahlil to\'xtatilgan',
          'Balansni to\'ldiring, mavjud ma\'lumotlar ko\'rinishda qoladi',
        );
      }

      reply.status(202);
      return {
        queued: result.queued,
        note: result.queued
          ? 'Tahlil navbatga qo\'yildi'
          : 'Tahlil allaqachon navbatda yoki bajarilmoqda',
      };
    },
  );
}
