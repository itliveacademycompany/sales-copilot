import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { withTenant, type Tx } from '../../db/index.js';
import { analysis, conversation, crmLead, integration, seat } from '../../db/schema/index.js';
import { ADAPTERLAR, CRM_TURLARI, crmTurimi } from '../../integrations/crm/index.js';
import { lidSozlamaniOl } from '../../integrations/crm/lidlar.js';
import { requireBusiness } from '../auth-plugin.js';
import { AppError } from '../errors.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CRM LIDLARI — ulangan CRM dan import qilingan sdelkalar ro'yxati
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ko'rinish huquqi: rahbar (`analytics:read:all`) — hammasi; sotuvchi —
 * faqat mas'uli o'zi bo'lgan lidlar (menejer kartochkasidagi "CRM ID"
 * orqali). Boshqalar — 403.
 *
 * Har lid uchun SotuvAI ma'lumoti ham: shu mijoz bilan nechta qo'ng'iroq
 * bo'lgan va oxirgisining bahosi — telefon bo'yicha bog'langan kontakt orqali.
 */

export const royxatQuery = z.object({
  q: z.string().trim().max(100).optional(),
  pipeline: z.string().max(64).optional(),
  stage: z.string().max(64).optional(),
  type: z.enum(['ochiq', 'muvaffaqiyat', 'yopilgan']).optional(),
  seat: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

/** Kim nimani ko'radi: `null` — hammasi, aks holda faqat shu menejerniki. */
function korishDoirasi(req: FastifyRequest): { seatId: string | null } {
  const b = req.business!;
  if (b.permissions.includes('analytics:read:all')) return { seatId: null };
  if (b.seatId) return { seatId: b.seatId };
  throw AppError.forbidden("Lidlarni ko'rish uchun ruxsatingiz yo'q");
}

export function registerCrmLidRoutes(app: FastifyInstance): void {
  const guard = { preHandler: [requireBusiness] };

  app.get('/api/v1/businesses/:businessId/crm-leads', guard, async (req) => {
    const f = royxatQuery.parse(req.query);
    const doira = korishDoirasi(req);
    const businessId = req.business!.businessId;

    return withTenant(businessId, (tx) => crmLidlarSorovi(tx, f, doira));
  });
}

/** Ro'yxat so'rovi — alohida, testda haqiqiy SQL sinaladi. */
export async function crmLidlarSorovi(tx: Tx, f: z.infer<typeof royxatQuery>, doira: { seatId: string | null }) {
  // Faol (ulangan yoki vaqtincha xatodagi) CRM — bittasi
  const [ulanish] = await tx
    .select({ id: integration.id, kind: integration.kind, config: integration.config, status: integration.status })
    .from(integration)
    .where(and(inArray(integration.kind, CRM_TURLARI), inArray(integration.status, ['connected', 'error'])))
    .limit(1);
  if (!ulanish || !crmTurimi(ulanish.kind)) {
    return { crm: null, items: [], total: 0, facets: { pipelines: [] }, sync: null };
  }
  const lidSozlama = lidSozlamaniOl(ulanish.config);

  // Doimiy shartlar: shu ulanish, tanlangan voronkalar, ko'rish doirasi
  const asos: SQL[] = [eq(crmLead.integrationId, ulanish.id)];
  if (lidSozlama.voronkalar) asos.push(inArray(crmLead.pipelineId, lidSozlama.voronkalar));
  if (doira.seatId) asos.push(eq(crmLead.seatId, doira.seatId));

  // Foydalanuvchi filtrlari
  const filtr: SQL[] = [...asos];
  if (f.pipeline) filtr.push(eq(crmLead.pipelineId, f.pipeline));
  if (f.stage) filtr.push(eq(crmLead.stageId, f.stage));
  if (f.type) filtr.push(eq(crmLead.stageType, f.type));
  if (f.seat && !doira.seatId) filtr.push(eq(crmLead.seatId, f.seat));
  if (f.q) {
    const raqam = f.q.replace(/\D/g, '');
    const shart = or(
      ilike(crmLead.name, `%${f.q}%`),
      ilike(crmLead.contactName, `%${f.q}%`),
      ...(raqam.length >= 4 ? [sql`${crmLead.phone} like ${`%${raqam}%`}`] : []),
    );
    if (shart) filtr.push(shart);
  }

  const [qatorlar, [jami], voronkalar] = await Promise.all([
    tx
      .select({
        id: crmLead.id,
        crmId: crmLead.crmId,
        name: crmLead.name,
        pipelineId: crmLead.pipelineId,
        pipelineName: crmLead.pipelineName,
        stageId: crmLead.stageId,
        stageName: crmLead.stageName,
        stageType: crmLead.stageType,
        amount: crmLead.amount,
        responsibleName: crmLead.responsibleName,
        seatId: crmLead.seatId,
        seatName: seat.displayName,
        contactId: crmLead.contactId,
        contactName: crmLead.contactName,
        phone: crmLead.phone,
        url: crmLead.url,
        crmCreatedAt: crmLead.crmCreatedAt,
        crmUpdatedAt: crmLead.crmUpdatedAt,
        closedAt: crmLead.closedAt,
      })
      .from(crmLead)
      .leftJoin(seat, eq(seat.id, crmLead.seatId))
      .where(and(...filtr))
      .orderBy(desc(crmLead.crmUpdatedAt), desc(crmLead.id))
      .limit(f.limit)
      .offset(f.offset),
    tx
      .select({ n: count() })
      .from(crmLead)
      .where(and(...filtr)),
    // Filtr paneli: voronka → bosqichlar, sonlari bilan (foydalanuvchi filtrlarisiz)
    tx
      .select({
        pipelineId: crmLead.pipelineId,
        pipelineName: crmLead.pipelineName,
        stageId: crmLead.stageId,
        stageName: crmLead.stageName,
        stageType: crmLead.stageType,
        n: count(),
      })
      .from(crmLead)
      .where(and(...asos))
      .groupBy(crmLead.pipelineId, crmLead.pipelineName, crmLead.stageId, crmLead.stageName, crmLead.stageType)
      .orderBy(asc(crmLead.pipelineName)),
  ]);

  // SotuvAI tomoni: shu mijoz bilan qo'ng'iroqlar va oxirgi tahlil
  const kontaktlar = [...new Set(qatorlar.map((q) => q.contactId).filter((x): x is string => Boolean(x)))];
  const qongiroqlar = new Map<string, { n: number; oxirgi: Date | null }>();
  const tahlillar = new Map<string, { conversationId: string; score: string | null; quality: string | null }>();
  if (kontaktlar.length > 0) {
    const s = await tx
      .select({
        contactId: conversation.contactId,
        n: count(),
        oxirgi: sql<Date | null>`max(${conversation.startedAt})`,
      })
      .from(conversation)
      .where(inArray(conversation.contactId, kontaktlar))
      .groupBy(conversation.contactId);
    for (const r of s)
      if (r.contactId) qongiroqlar.set(r.contactId, { n: Number(r.n), oxirgi: r.oxirgi ? new Date(r.oxirgi) : null });

    const a = await tx
      .selectDistinctOn([conversation.contactId], {
        contactId: conversation.contactId,
        conversationId: conversation.id,
        score: analysis.overallScore,
        quality: analysis.leadQuality,
      })
      .from(analysis)
      .innerJoin(conversation, eq(conversation.id, analysis.conversationId))
      .where(inArray(conversation.contactId, kontaktlar))
      .orderBy(conversation.contactId, desc(conversation.startedAt));
    for (const r of a)
      if (r.contactId)
        tahlillar.set(r.contactId, { conversationId: r.conversationId, score: r.score, quality: r.quality });
  }

  // Voronka → bosqichlar
  const pipelines = new Map<
    string,
    { id: string; name: string; count: number; stages: { id: string; name: string; type: string; count: number }[] }
  >();
  for (const v of voronkalar) {
    const pid = v.pipelineId ?? '';
    const p = pipelines.get(pid) ?? { id: pid, name: v.pipelineName ?? '—', count: 0, stages: [] };
    p.count += Number(v.n);
    if (v.stageId)
      p.stages.push({ id: v.stageId, name: v.stageName ?? v.stageId, type: v.stageType, count: Number(v.n) });
    pipelines.set(pid, p);
  }

  return {
    crm: { kind: ulanish.kind, name: ADAPTERLAR[ulanish.kind].nom, status: ulanish.status },
    sync: { birinchiTugadi: lidSozlama.birinchiTugadi, oxirgi: lidSozlama.oxirgi, xato: lidSozlama.xato },
    total: Number(jami?.n ?? 0),
    items: qatorlar.map((q) => {
      const c = q.contactId ? qongiroqlar.get(q.contactId) : undefined;
      const t = q.contactId ? tahlillar.get(q.contactId) : undefined;
      return {
        ...q,
        amount: q.amount === null ? null : Number(q.amount),
        calls: c ? { count: c.n, lastAt: c.oxirgi } : { count: 0, lastAt: null },
        lastAnalysis: t
          ? { conversationId: t.conversationId, score: t.score === null ? null : Number(t.score), quality: t.quality }
          : null,
      };
    }),
    facets: { pipelines: [...pipelines.values()] },
  };
}
