import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { verifyEvidence } from '../../ai/analyze.js';
import { withTenant, withoutTenantIsolation } from '../../db/index.js';
import {
  alert,
  appUser,
  conversation,
  criterionScore,
  scoreAppeal,
  transcriptSegment,
} from '../../db/schema/index.js';
import { requireBusiness, requirePermission } from '../auth-plugin.js';
import { AppError } from '../errors.js';
import { assertSeatAllowed, conversationScope } from '../scope.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BAHOGA E'TIROZ — TZ 2.2, FR-124
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * AI xato baholashi mumkin. Sotuvchi "men buni aytdim, AI eshitmagan" deb
 * e'tiroz bildira olmasa — tizimga ishonch yo'qoladi va sabotaj boshlanadi.
 * TZ buni mahsulotning yashash sharti deb ataydi va bu mubolag'a emas:
 * o'lchanayotgan odam o'lchovga qarshi chiqa olmasa, u o'lchovni aldashni
 * o'rganadi.
 *
 * Oqim:
 *   sotuvchi e'tiroz bildiradi (mezon + sabab)
 *     → rahbarga ogohlantirish
 *       → rahbar qabul qiladi (ball o'zgaradi) yoki rad etadi (sabab bilan)
 *
 * ── Ikkita qat'iy qoida ──
 *
 * 1. **Qabul qilishda ham isbot majburiy.** Rahbar ballni ko'tarsa,
 *    transkriptdan iqtibos keltirishi va u `verifyEvidence` dan o'tishi
 *    shart — xuddi AI kabi. Isbot talabi modelga emas, BALLGA tegishli.
 *    Aks holda "AI ga ishonmaymiz, odamga ishonamiz" degan teshik ochilardi
 *    va bazadagi CHECK cheklovi ham buni baribir rad etardi.
 *
 * 2. **Bir mezonga bitta ochiq e'tiroz.** Aks holda norozi sotuvchi bitta
 *    ballga o'nta e'tiroz yozib, rahbarning navbatini bo'g'ib qo'yardi.
 */

const createBody = z.object({
  reason: z.string().trim().min(10, 'Sabab kamida 10 belgi bo\'lsin').max(1000),
});

const resolveBody = z
  .object({
    status: z.enum(['accepted', 'rejected']),
    /** Qabul qilinganda majburiy. */
    newScore: z.number().int().min(0).max(10).optional(),
    /** Ballga asos — transkriptda mavjudligi tekshiriladi. */
    evidenceQuote: z.string().trim().min(3).max(1000).optional(),
    resolutionNote: z.string().trim().max(1000).optional(),
  })
  .refine((v) => v.status !== 'accepted' || v.newScore !== undefined, {
    message: 'Qabul qilishda yangi ball ko\'rsatilishi shart',
    path: ['newScore'],
  })
  .refine((v) => v.status !== 'rejected' || (v.resolutionNote ?? '').length > 0, {
    message: 'Rad etishda sabab yozilishi shart',
    path: ['resolutionNote'],
  });

export function registerAppealRoutes(app: FastifyInstance): void {
  /**
   * Sotuvchi e'tiroz bildiradi.
   *
   * Ruxsat `appeal:create` — sotuvchida bor, auditorda yo'q. Bundan tashqari
   * suhbat ko'lami tekshiriladi: begona suhbatga e'tiroz bildirib bo'lmaydi.
   */
  app.post(
    '/api/v1/businesses/:businessId/appeals',
    { preHandler: [requireBusiness, requirePermission('appeal:create')] },
    async (req, reply) => {
      const { scoreId } = z.object({ scoreId: z.string() }).parse(req.query);
      const body = createBody.parse(req.body);
      const businessId = req.business!.businessId;
      const scope = conversationScope(req);

      const created = await withTenant(businessId, async (tx) => {
        const [row] = await tx
          .select({
            id: criterionScore.id,
            conversationId: criterionScore.conversationId,
            seatId: criterionScore.seatId,
            score: criterionScore.score,
            code: criterionScore.criterionCode,
          })
          .from(criterionScore)
          .where(eq(criterionScore.id, BigInt(scoreId)))
          .limit(1);
        if (!row) throw AppError.notFound();
        assertSeatAllowed(scope, row.seatId);

        const [ochiq] = await tx
          .select({ id: scoreAppeal.id })
          .from(scoreAppeal)
          .where(
            and(eq(scoreAppeal.criterionScoreId, row.id), eq(scoreAppeal.status, 'open')),
          )
          .limit(1);
        if (ochiq) {
          throw AppError.conflict('Bu bahoga allaqachon ko\'rilmagan e\'tiroz bor');
        }

        const [appeal] = await tx
          .insert(scoreAppeal)
          .values({
            criterionScoreId: row.id,
            businessId,
            conversationId: row.conversationId,
            raisedBy: req.auth!.user.id,
            reason: body.reason,
            originalScore: row.score,
          })
          .returning();

        // Rahbar e'tirozni ko'rmasa, oqimning ma'nosi yo'q.
        await tx.insert(alert).values({
          businessId,
          seatId: row.seatId,
          conversationId: row.conversationId,
          kind: 'score_appeal',
          severity: 'info',
          title: `Bahoga e'tiroz: ${row.code}`,
          body: { appealId: appeal!.id, reason: body.reason },
          dedupeKey: `appeal:${appeal!.id}`,
        });

        return appeal!;
      });

      reply.status(201);
      // `criterion_score.id` — bigint. JSON.stringify uni serializatsiya
      // qila olmaydi va butun javob 500 bilan yiqiladi. Chegarada satrga
      // aylantiriladi (segment id'lari bilan bir xil yondashuv).
      return { ...created, criterionScoreId: String(created.criterionScoreId) };
    },
  );

  /** Rahbar uchun ro'yxat. */
  app.get(
    '/api/v1/businesses/:businessId/appeals',
    { preHandler: [requireBusiness, requirePermission('appeal:resolve')] },
    async (req) => {
      const q = z
        .object({ status: z.enum(['open', 'accepted', 'rejected']).optional() })
        .parse(req.query);
      const businessId = req.business!.businessId;

      const rows = await withTenant(businessId, (tx) =>
        tx
          .select({
            id: scoreAppeal.id,
            criterionScoreId: scoreAppeal.criterionScoreId,
            status: scoreAppeal.status,
            reason: scoreAppeal.reason,
            originalScore: scoreAppeal.originalScore,
            newScore: scoreAppeal.newScore,
            resolutionNote: scoreAppeal.resolutionNote,
            createdAt: scoreAppeal.createdAt,
            resolvedAt: scoreAppeal.resolvedAt,
            raisedBy: scoreAppeal.raisedBy,
            conversationId: scoreAppeal.conversationId,
            criterionCode: criterionScore.criterionCode,
            criterionName: criterionScore.criterionName,
            maxScore: criterionScore.maxScore,
            evidenceQuote: criterionScore.evidenceQuote,
          })
          .from(scoreAppeal)
          .innerJoin(criterionScore, eq(criterionScore.id, scoreAppeal.criterionScoreId))
          .where(q.status ? eq(scoreAppeal.status, q.status) : undefined)
          .orderBy(desc(scoreAppeal.createdAt))
          .limit(100),
      );

      // `app_user` tenant jadvali emas — ismlarni alohida olamiz.
      const ids = [...new Set(rows.map((r) => r.raisedBy).filter((v): v is string => !!v))];
      const names = ids.length
        ? await withoutTenantIsolation('e\'tirozlar: muallif ismini olish', (tx) =>
            tx
              .select({ id: appUser.id, displayName: appUser.displayName })
              .from(appUser)
              .where(inArray(appUser.id, ids)),
          )
        : [];
      const byId = new Map(names.map((u) => [u.id, u.displayName]));

      return {
        appeals: rows.map((r) => ({
          ...r,
          criterionScoreId: String(r.criterionScoreId),
          raisedByName: byId.get(r.raisedBy ?? '') ?? null,
        })),
        openCount: rows.filter((r) => r.status === 'open').length,
      };
    },
  );

  /** Rahbar hal qiladi. */
  app.patch(
    '/api/v1/businesses/:businessId/appeals/:appealId',
    { preHandler: [requireBusiness, requirePermission('appeal:resolve')] },
    async (req) => {
      const { appealId } = z
        .object({ businessId: z.string().uuid(), appealId: z.string().uuid() })
        .parse(req.params);
      const body = resolveBody.parse(req.body);
      const businessId = req.business!.businessId;

      return withTenant(businessId, async (tx) => {
        const [appeal] = await tx
          .select()
          .from(scoreAppeal)
          .where(eq(scoreAppeal.id, appealId))
          .limit(1);
        if (!appeal) throw AppError.notFound();
        if (appeal.status !== 'open') {
          throw AppError.conflict('Bu e\'tiroz allaqachon hal qilingan');
        }

        if (body.status === 'accepted') {
          const [score] = await tx
            .select({
              id: criterionScore.id,
              maxScore: criterionScore.maxScore,
              evidenceQuote: criterionScore.evidenceQuote,
            })
            .from(criterionScore)
            .where(eq(criterionScore.id, appeal.criterionScoreId))
            .limit(1);
          if (!score) throw AppError.notFound();

          if (body.newScore! > score.maxScore) {
            throw AppError.badRequest(`Ball ${score.maxScore} dan oshmasligi kerak`);
          }

          /**
           * Isbot: mavjud iqtibos saqlanadi, yangisi berilsa tekshiriladi.
           * Ilgari ball `null` bo'lgan bo'lsa (isbot yo'q), yangi iqtibos
           * MAJBURIY — aks holda bazadagi CHECK cheklovi yozuvni rad etadi
           * va foydalanuvchi tushunarsiz xato ko'rardi.
           */
          let quote = score.evidenceQuote;
          let segmentId: bigint | null = null;
          let startSeconds: string | null = null;

          if (body.evidenceQuote) {
            const segs = await tx
              .select({
                id: transcriptSegment.id,
                seq: transcriptSegment.seq,
                speaker: transcriptSegment.speaker,
                text: transcriptSegment.text,
                startSeconds: transcriptSegment.startSeconds,
              })
              .from(transcriptSegment)
              .where(eq(transcriptSegment.conversationId, appeal.conversationId))
              .orderBy(transcriptSegment.seq);

            const check = verifyEvidence(
              body.evidenceQuote,
              null,
              segs.map((s) => ({
                id: s.id,
                seq: s.seq,
                speaker: s.speaker,
                text: s.text,
                startSeconds: Number(s.startSeconds ?? 0),
              })),
            );
            if (!check.found) {
              throw AppError.badRequest(
                'Iqtibos yozishmada topilmadi — matnni aynan nusxalab qo\'ying',
              );
            }
            quote = body.evidenceQuote;
            segmentId = check.segmentId;
            startSeconds = check.startSeconds;
          }

          if (!quote) {
            throw AppError.badRequest(
              'Bu mezon isbotsiz edi — ball qo\'yish uchun yozishmadan iqtibos keltiring',
            );
          }

          await tx
            .update(criterionScore)
            .set({
              score: body.newScore!,
              evidenceQuote: quote,
              ...(segmentId !== null ? { evidenceSegmentId: segmentId } : {}),
              ...(startSeconds !== null ? { evidenceStartSeconds: startSeconds } : {}),
              // Qo'lda tuzatilgan ball "zaif joy" hisobiga kirmasin.
              isWeakArea: false,
            })
            .where(eq(criterionScore.id, appeal.criterionScoreId));
        }

        const [updated] = await tx
          .update(scoreAppeal)
          .set({
            status: body.status,
            newScore: body.status === 'accepted' ? body.newScore! : null,
            resolutionNote: body.resolutionNote ?? null,
            resolvedBy: req.auth!.user.id,
            resolvedAt: new Date(),
          })
          .where(eq(scoreAppeal.id, appealId))
          .returning({
            id: scoreAppeal.id,
            status: scoreAppeal.status,
            newScore: scoreAppeal.newScore,
            originalScore: scoreAppeal.originalScore,
            resolutionNote: scoreAppeal.resolutionNote,
            resolvedAt: scoreAppeal.resolvedAt,
          });

        // Ogohlantirish endi harakat talab qilmaydi.
        await tx
          .update(alert)
          .set({ status: 'resolved', resolvedAt: new Date() })
          .where(eq(alert.dedupeKey, `appeal:${appealId}`));

        /**
         * Umumiy ball qayta hisoblanmaydi — bu ataylab.
         * `analysis.overall_score` tahlil paytidagi holatni saqlaydi.
         * Qayta hisoblash uchun butun vaznli mantiqni takrorlash kerak
         * bo'lardi; buning o'rniga rahbar "qayta tahlil" tugmasini
         * bosadi va quvur hammasini yangidan hisoblaydi.
         */
        return updated!;
      });
    },
  );

  /**
   * Kalibratsiya: qaysi mezonda AI ko'p xato qiladi.
   *
   * TZ 2.2 shuni ta'kidlaydi — qabul qilingan e'tirozlar shunchaki
   * tuzatish emas, **modelni sozlash uchun ma'lumot**. Qaysi mezonda
   * e'tiroz ko'p bo'lsa, o'sha mezonning ta'rifi yoki rubrikasi noaniq.
   */
  app.get(
    '/api/v1/businesses/:businessId/appeals/analytics',
    { preHandler: [requireBusiness, requirePermission('appeal:resolve')] },
    async (req) => {
      const businessId = req.business!.businessId;
      const rows = await withTenant(businessId, (tx) =>
        tx.execute(sql`
          select
            cs.criterion_code,
            min(cs.criterion_name)                                        as criterion_name,
            count(*)::int                                                 as total,
            count(*) filter (where a.status = 'accepted')::int            as accepted,
            count(*) filter (where a.status = 'rejected')::int            as rejected,
            count(*) filter (where a.status = 'open')::int                as open,
            round(avg(a.new_score - a.original_score)
                  filter (where a.status = 'accepted'), 2)::float         as avg_correction
          from score_appeal a
          join criterion_score cs on cs.id = a.criterion_score_id
          group by cs.criterion_code
          order by count(*) filter (where a.status = 'accepted') desc
        `),
      );

      return {
        criteria: (rows as Record<string, unknown>[]).map((r) => ({
          code: r.criterion_code,
          name: r.criterion_name,
          total: r.total,
          accepted: r.accepted,
          rejected: r.rejected,
          open: r.open,
          avgCorrection: r.avg_correction,
        })),
      };
    },
  );
}
