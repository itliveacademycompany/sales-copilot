import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../../db/index.js';
import { conversation, seat, transcriptSegment } from '../../db/schema/index.js';
import { assignOffsets, parseTranscript } from '../../import/transcript-parser.js';
import { enqueueAnalysis } from '../../jobs/queue.js';
import { requireBusiness, requirePermission } from '../auth-plugin.js';
import { AppError } from '../errors.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * QO'LDA SUHBAT YUKLASH — sinov vositasi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Nega kerak: Telegram kanalini ulab, haqiqiy suhbat kelishini kutish —
 * bu bir necha kun. Baholash to'g'ri ishlayotganini bilish esa BUGUN
 * kerak. Bu endpoint mavjud suhbatni tizimga berib, natijani darhol
 * ko'rish imkonini beradi.
 *
 * **Soxta yo'l emas.** Yuklangan suhbat xuddi Telegram'dan kelgani kabi
 * navbatga tushadi va O'SHA quvurdan o'tadi: pre-filter → ekstraksiya →
 * isbotli baholash → isbotni kodda tekshirish. Ya'ni bu yerda ko'rgan
 * natijangiz haqiqiy natija.
 *
 * Ruxsat `playbook:write` — qayta tahlil bilan bir xil. Sabab ham bir
 * xil: har yuklash LLM chaqiruvi, ya'ni pul. O'qish huquqi yetarli emas.
 *
 * ⚠️ Suhbat `external_source = 'manual'` bilan belgilanadi. Bu muhim:
 * sinov ma'lumoti haqiqiy statistikadan ajratilishi kerak, aks holda
 * dashboard'dagi raqamlar "biz nima yukladik" ni ko'rsatib qoladi.
 *
 * FR-84 haqida: rol matndagi yorliqdan olinadi ("Mijoz:" / "Menejer:"),
 * model taxminidan emas. Ya'ni bu yerda rol almashib ketishi mumkin
 * emas — lekin yorliqni odam qo'ygani uchun u `telegram_id` darajasida
 * deterministik ham emas. Shuning uchun `dryRun` rejimi bor: saqlashdan
 * oldin kim gapirgani to'g'ri tushunilganini ko'rish mumkin.
 */

const importBody = z.object({
  seatId: z.string().uuid(),
  /** Odam joylashtirgan xom matn. */
  text: z.string().trim().min(20, 'Transkript juda qisqa').max(200_000),
  /** Suhbat qachon bo'lgan. Standart — hozir. */
  startedAt: z.coerce.date().optional(),
  channel: z.enum(['telegram', 'phone', 'meeting', 'whatsapp', 'instagram']).default('telegram'),
  /** Faqat segmentlarga bo'lib ko'rsatish, saqlamasdan. */
  dryRun: z.boolean().default(false),
});

export function registerImportRoutes(app: FastifyInstance): void {
  app.post(
    '/api/v1/businesses/:businessId/conversations/import',
    { preHandler: [requireBusiness, requirePermission('playbook:write')] },
    async (req, reply) => {
      const body = importBody.parse(req.body);
      const businessId = req.business!.businessId;

      const { segments, warnings } = parseTranscript(body.text);
      if (segments.length === 0) {
        throw AppError.badRequest(
          'Matndan birorta xabar ajratilmadi. Har qatorni "Mijoz:" yoki "Menejer:" bilan boshlang.',
        );
      }

      /**
       * Ko'rib chiqish rejimi: foydalanuvchi saqlashdan OLDIN nima
       * tushunilganini ko'radi. Rollar teskari aniqlangan bo'lsa,
       * buni tahlildan keyin emas, oldin bilish kerak (FR-84).
       */
      if (body.dryRun) {
        return {
          dryRun: true,
          segments: segments.map((s, i) => ({ seq: i, speaker: s.speaker, text: s.text })),
          warnings,
        };
      }

      const startedAt = body.startedAt ?? new Date();
      const offsets = assignOffsets(segments);

      const created = await withTenant(businessId, async (tx) => {
        const [s] = await tx
          .select({ id: seat.id })
          .from(seat)
          .where(eq(seat.id, body.seatId))
          .limit(1);
        if (!s) throw AppError.badRequest('Bunday sotuvchi topilmadi');

        const [conv] = await tx
          .insert(conversation)
          .values({
            businessId,
            seatId: body.seatId,
            channel: body.channel,
            direction: 'na',
            externalSource: 'manual',
            externalId: `manual:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
            startedAt,
            endedAt: new Date(startedAt.getTime() + (offsets[offsets.length - 1] ?? 0) * 1000),
            status: 'received',
          })
          .returning({ id: conversation.id });

        await tx.insert(transcriptSegment).values(
          segments.map((seg, i) => ({
            conversationId: conv!.id,
            businessId,
            seq: i,
            speaker: seg.speaker,
            text: seg.text,
            startSeconds: String(offsets[i] ?? i * 30),
          })),
        );

        return conv!.id;
      });

      const queued = await enqueueAnalysis(businessId, created);
      if (queued.reason === 'billing_blocked') {
        throw AppError.paymentRequired(
          'Obuna faol emas — yangi tahlil to\'xtatilgan',
          'Balansni to\'ldiring',
        );
      }

      reply.status(201);
      return {
        conversationId: created,
        segmentCount: segments.length,
        queued: queued.queued,
        warnings,
        note: 'Suhbat navbatga qo\'yildi. Tahlil bir necha soniyada tayyor bo\'ladi.',
      };
    },
  );
}
