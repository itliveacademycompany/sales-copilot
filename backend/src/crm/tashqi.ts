import { and, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import type { Tx } from '../db/index.js';
import { crmField, crmPipeline, crmStage, deal, dealEvent, integration } from '../db/schema/index.js';
import type { CrmLid, CrmTuzilish } from '../integrations/crm/adapter.js';
import { bosqichRangi, type BosqichTuri } from './shablon.js';
import { maydonlarniTekshir, type MaydonTavsifi } from './xizmat.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TASHQI CRM → ICHKI CRM (bir tomonlama sinxron)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * amoCRM (yoki Bitrix24) dagi sdelkalar SotuvAI ichki CRM bitimlariga
 * aylanadi: voronka, bosqich, qo'shimcha maydonlar, kontakt va mas'ul bilan.
 * Lid sinxroni (`integrations/crm/lidlar.ts`) har sahifadan keyin shu yerga
 * uzatadi — alohida so'rov yoki tik kerak emas.
 *
 * Qoidalar:
 *   • Kalit — `integration_id + external_id`: qayta kelsa yangilanadi, dubl yo'q.
 *   • Tashqi CRM asosiy manba: nom, summa, bosqich, mas'ul, qo'shimcha
 *     maydonlar o'sha yerdan; SotuvAI da ular faqat o'qiladi (xizmat
 *     tekshiradi). Izoh, vazifa, teg, kompaniya — SotuvAI da erkin.
 *   • O'zgarishlar bitim tarixiga `sync` belgisi bilan yoziladi.
 *   • Ichki CRM yoqilmagan bo'lsa — tashqi tuzilma bilan o'zi yoqiladi;
 *     birinchi marta bitimsiz shablon voronkalari arxivlanadi (chalkashmasin).
 */

const TUR: Record<'ochiq' | 'muvaffaqiyat' | 'yopilgan', BosqichTuri> = { ochiq: 'open', muvaffaqiyat: 'won', yopilgan: 'lost' };

export interface TashqiXarita {
  voronka: Map<string, string>;
  bosqich: Map<string, { id: string; pipelineId: string; kind: BosqichTuri; name: string }>;
  maydon: Map<string, MaydonTavsifi>;
}

/**
 * Tuzilmani ko'chiradi va tashqi ID → ichki yozuv xaritasini qaytaradi.
 * `voronkalar` — sozlamada tanlanganlar (`null` — hammasi).
 */
export async function tuzilmaniKochir(
  tx: Tx,
  p: { businessId: string; integrationId: string; t: CrmTuzilish; voronkalar: string[] | null; birinchi: boolean },
): Promise<TashqiXarita> {
  const kerakli = p.t.pipelines.filter((v) => !p.voronkalar || p.voronkalar.includes(v.id));

  // Birinchi marta: bitimsiz, tashqi bo'lmagan (shablon) voronkalar arxivga
  if (p.birinchi) {
    await tx
      .update(crmPipeline)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          isNull(crmPipeline.integrationId),
          isNull(crmPipeline.archivedAt),
          sql`not exists (select 1 from deal d where d.pipeline_id = ${crmPipeline.id} and d.deleted_at is null)`,
        ),
      );
    // Shablon maydonlari ham — hech bir bitimda qiymati yo'q bo'lsa (amoCRM maydonlari bilan takrorlanmasin).
    // Arxivlash qaytariladigan amal: qiymatlar o'chmaydi, sozlamada qayta yoqiladi.
    await tx
      .update(crmField)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          isNull(crmField.integrationId),
          isNull(crmField.archivedAt),
          sql`not exists (select 1 from deal d where coalesce(d.fields -> (${crmField.id}::text), 'null'::jsonb) <> 'null'::jsonb)`,
        ),
      );
  }

  const borVoronkalar = await tx
    .select({ id: crmPipeline.id, externalId: crmPipeline.externalId })
    .from(crmPipeline)
    .where(eq(crmPipeline.integrationId, p.integrationId));
  const [asosiyBor] = await tx
    .select({ id: crmPipeline.id })
    .from(crmPipeline)
    .where(and(eq(crmPipeline.isMain, true), isNull(crmPipeline.archivedAt), isNull(crmPipeline.integrationId)))
    .limit(1);

  const xarita: TashqiXarita = { voronka: new Map(), bosqich: new Map(), maydon: new Map() };
  for (const [i, v] of kerakli.entries()) {
    const bor = borVoronkalar.find((b) => b.externalId === v.id);
    let pipelineId: string;
    if (bor) {
      await tx
        .update(crmPipeline)
        .set({ name: v.name, sort: i, archivedAt: null, updatedAt: new Date() })
        .where(eq(crmPipeline.id, bor.id));
      pipelineId = bor.id;
    } else {
      const [y] = await tx
        .insert(crmPipeline)
        .values({ businessId: p.businessId, name: v.name, sort: i, isMain: v.isMain && !asosiyBor, integrationId: p.integrationId, externalId: v.id })
        .returning({ id: crmPipeline.id });
      pipelineId = y!.id;
    }
    xarita.voronka.set(v.id, pipelineId);

    const borBosqichlar = await tx
      .select({ id: crmStage.id, externalId: crmStage.externalId })
      .from(crmStage)
      .where(eq(crmStage.pipelineId, pipelineId));
    for (const [j, s] of v.statuses.entries()) {
      const kind = TUR[s.tur];
      const color = s.color ?? bosqichRangi(kind, j);
      const bb = borBosqichlar.find((b) => b.externalId === s.id);
      let stageId: string;
      if (bb) {
        await tx.update(crmStage).set({ name: s.name, kind, color, sort: j, updatedAt: new Date() }).where(eq(crmStage.id, bb.id));
        stageId = bb.id;
      } else {
        const [y] = await tx
          .insert(crmStage)
          .values({ businessId: p.businessId, pipelineId, name: s.name, kind, color, sort: j, externalId: s.id })
          .returning({ id: crmStage.id });
        stageId = y!.id;
      }
      xarita.bosqich.set(s.id, { id: stageId, pipelineId, kind, name: s.name });
    }
  }
  // Tashqi CRM da yo'qolgan (yoki tanlovdan chiqarilgan) voronkalar — arxivga, bitimlari saqlanadi
  const qolgan = [...xarita.voronka.values()];
  await tx
    .update(crmPipeline)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(crmPipeline.integrationId, p.integrationId),
        isNull(crmPipeline.archivedAt),
        qolgan.length ? notInArray(crmPipeline.id, qolgan) : undefined,
      ),
    );

  // Qo'shimcha maydonlar
  const borMaydonlar = await tx
    .select({ id: crmField.id, externalId: crmField.externalId })
    .from(crmField)
    .where(eq(crmField.integrationId, p.integrationId));
  const korilgan: string[] = [];
  for (const f of p.t.leadFields) {
    const bf = borMaydonlar.find((b) => b.externalId === f.id);
    const qiymat = {
      label: f.name.slice(0, 100),
      type: f.type,
      groupName: (f.group ?? 'amoCRM').slice(0, 60),
      options: f.options,
      sort: 1000 + f.sort,
      archivedAt: null,
      updatedAt: new Date(),
    };
    let id: string;
    if (bf) {
      await tx.update(crmField).set(qiymat).where(eq(crmField.id, bf.id));
      id = bf.id;
    } else {
      const [y] = await tx
        .insert(crmField)
        .values({ businessId: p.businessId, code: `ext_${p.integrationId.slice(0, 8)}_${f.id}`, integrationId: p.integrationId, externalId: f.id, ...qiymat })
        .returning({ id: crmField.id });
      id = y!.id;
    }
    korilgan.push(id);
    xarita.maydon.set(f.id, { id, code: '', label: f.name, type: f.type, options: f.options, groupName: f.group, sort: f.sort, required: false });
  }
  if (p.t.leadFields.length > 0) {
    await tx
      .update(crmField)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(crmField.integrationId, p.integrationId), isNull(crmField.archivedAt), korilgan.length ? notInArray(crmField.id, korilgan) : undefined));
  }
  return xarita;
}

/** amoCRM sanasi — unix soniya (Toshkent yarim tuni) yoki matn → `YYYY-MM-DD`. */
function sanaga(v: string | number | boolean | undefined): string | null {
  if (v === undefined || typeof v === 'boolean') return null;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date((n + 5 * 3600) * 1000).toISOString().slice(0, 10);
}

/** Tashqi xom qiymat → ichki CRM maydon qiymati (turga qarab). Noto'g'risi — `null`. */
export function qiymatniOgir(m: MaydonTavsifi, v: { enum: string[]; qiymatlar: (string | number | boolean)[] }): unknown {
  const birinchi = v.qiymatlar[0];
  switch (m.type) {
    case 'select':
      return v.enum.find((e) => m.options.some((o) => o.id === e)) ?? null;
    case 'multiselect': {
      const r = v.enum.filter((e) => m.options.some((o) => o.id === e));
      return r.length ? r : null;
    }
    case 'checkbox':
      return birinchi === undefined ? null : birinchi === true || birinchi === 1 || birinchi === '1' || birinchi === 'true';
    case 'number':
    case 'money': {
      const n = Number(typeof birinchi === 'string' ? birinchi.replace(/\s/g, '').replace(',', '.') : birinchi);
      return birinchi === undefined || !Number.isFinite(n) ? null : n;
    }
    case 'date':
      return sanaga(birinchi);
    case 'datetime': {
      if (birinchi === undefined || typeof birinchi === 'boolean') return null;
      const n = Number(birinchi);
      const d = Number.isFinite(n) && n > 0 ? new Date(n * 1000) : new Date(String(birinchi));
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    case 'url': {
      const s = String(birinchi ?? '').trim();
      return /^https?:\/\//i.test(s) ? s.slice(0, 500) : s ? `https://${s}`.slice(0, 500) : null;
    }
    case 'textarea':
      return v.qiymatlar.length ? v.qiymatlar.map(String).join('\n').slice(0, 5000) : null;
    default: {
      const s = v.qiymatlar.map(String).join(', ').trim();
      return s ? s.slice(0, 500) : null;
    }
  }
}

/** Lidning qo'shimcha maydonlari — faqat ko'chirilgan maydonlar, yaroqsizi tashlanadi. */
function maydonlarniYasa(l: CrmLid, xarita: TashqiXarita): Record<string, unknown> {
  const natija: Record<string, unknown> = {};
  const tavsiflar = [...xarita.maydon.values()];
  for (const [fid, v] of Object.entries(l.maydonlar ?? {})) {
    const m = xarita.maydon.get(fid);
    if (!m) continue;
    const q = qiymatniOgir(m, v);
    if (q === null) continue;
    try {
      Object.assign(natija, maydonlarniTekshir({ [m.id]: q }, tavsiflar));
    } catch {
      /* noto'g'ri qiymat — o'tkazib yuboriladi, lid baribir keladi */
    }
  }
  return natija;
}

/**
 * Lidlar sahifasini bitimlarga upsert qiladi. Mavjud bitimda o'zgargan
 * maydonlar tarixga yoziladi. Natija — yangi va yangilangan soni.
 */
export async function lidlarniKochir(
  tx: Tx,
  p: {
    businessId: string;
    integrationId: string;
    manba: string;
    lidlar: CrmLid[];
    xarita: TashqiXarita;
    /** CRM foydalanuvchi ID → menejer (seat). */
    seatlar: Map<string, string>;
    /** CRM lid ID → SotuvAI kontakt ID. */
    kontaktlar: Map<string, string>;
  },
): Promise<{ yangi: number; yangilandi: number }> {
  const lidlar = p.lidlar.filter((l) => l.bosqichId && p.xarita.bosqich.has(l.bosqichId));
  if (lidlar.length === 0) return { yangi: 0, yangilandi: 0 };
  const tashqiMaydonIdlar = new Set([...p.xarita.maydon.values()].map((m) => m.id));
  const mavjudlar = await tx
    .select({
      id: deal.id,
      externalId: deal.externalId,
      name: deal.name,
      amount: deal.amount,
      stageId: deal.stageId,
      pipelineId: deal.pipelineId,
      responsibleSeatId: deal.responsibleSeatId,
      contactId: deal.contactId,
      fields: deal.fields,
    })
    .from(deal)
    .where(and(eq(deal.integrationId, p.integrationId), inArray(deal.externalId, lidlar.map((l) => l.id))));
  const xaritaBor = new Map(mavjudlar.map((m) => [m.externalId!, m]));
  let yangi = 0;
  let yangilandi = 0;

  for (const l of lidlar) {
    const b = p.xarita.bosqich.get(l.bosqichId!)!;
    const nom = (l.nom?.trim() || l.kontaktNom?.trim() || `Sdelka #${l.id}`).slice(0, 250);
    const summa = l.summa === null || !Number.isFinite(l.summa) ? null : String(Number(l.summa).toFixed(2));
    const masul = l.masulId ? (p.seatlar.get(l.masulId) ?? null) : null;
    const kontakt = p.kontaktlar.get(l.id) ?? null;
    const tashqiMaydonlar = maydonlarniYasa(l, p.xarita);
    const yopiq = b.kind !== 'open';
    const bor = xaritaBor.get(l.id);

    if (!bor) {
      const [d] = await tx
        .insert(deal)
        .values({
          businessId: p.businessId,
          pipelineId: b.pipelineId,
          stageId: b.id,
          name: nom,
          amount: summa,
          responsibleSeatId: masul,
          contactId: kontakt,
          fields: tashqiMaydonlar,
          source: p.manba,
          stageEnteredAt: l.yangilangan,
          closedAt: yopiq ? (l.yopilgan ?? l.yangilangan) : null,
          createdAt: l.yaratilgan ?? new Date(),
          updatedAt: l.yangilangan,
          integrationId: p.integrationId,
          externalId: l.id,
          externalUrl: l.url,
        })
        .onConflictDoNothing()
        .returning({ id: deal.id });
      if (d) {
        await tx.insert(dealEvent).values({
          businessId: p.businessId,
          dealId: d.id,
          type: 'created',
          data: { stageId: b.id, stageName: b.name, source: p.manba, sync: p.manba },
          authorUserId: null,
          createdAt: l.yaratilgan ?? new Date(),
        });
        yangi++;
      }
      continue;
    }

    // Mavjud bitim: faqat o'zgarganlari
    const ozg: Partial<typeof deal.$inferInsert> = {};
    const hodisalar: { type: string; data: Record<string, unknown> }[] = [];
    if (bor.name !== nom) {
      ozg.name = nom;
      hodisalar.push({ type: 'field', data: { field: 'name', before: bor.name, after: nom, sync: p.manba } });
    }
    const eskiSumma = bor.amount === null ? null : String(Number(bor.amount).toFixed(2));
    if (eskiSumma !== summa) {
      ozg.amount = summa;
      hodisalar.push({ type: 'field', data: { field: 'amount', before: eskiSumma, after: summa, sync: p.manba } });
    }
    if (bor.stageId !== b.id) {
      const [eski] = await tx.select({ name: crmStage.name }).from(crmStage).where(eq(crmStage.id, bor.stageId)).limit(1);
      ozg.stageId = b.id;
      ozg.pipelineId = b.pipelineId;
      ozg.stageEnteredAt = l.yangilangan;
      ozg.closedAt = yopiq ? (l.yopilgan ?? l.yangilangan) : null;
      hodisalar.push({
        type: 'stage',
        data: { fromStageId: bor.stageId, fromName: eski?.name ?? null, toStageId: b.id, toName: b.name, pipelineChanged: bor.pipelineId !== b.pipelineId, sync: p.manba },
      });
    }
    if (bor.responsibleSeatId !== masul) {
      ozg.responsibleSeatId = masul;
      hodisalar.push({ type: 'responsible', data: { before: bor.responsibleSeatId, after: masul, sync: p.manba } });
    }
    if (!bor.contactId && kontakt) ozg.contactId = kontakt;
    // Qo'shimcha maydonlar: tashqilari to'liq almashadi, SotuvAI niki saqlanadi
    const eski = (bor.fields ?? {}) as Record<string, unknown>;
    const yangiMaydonlar: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(eski)) if (!tashqiMaydonIdlar.has(k)) yangiMaydonlar[k] = v;
    Object.assign(yangiMaydonlar, tashqiMaydonlar);
    let maydonOzgardi = false;
    for (const id of new Set([...Object.keys(eski), ...Object.keys(yangiMaydonlar)])) {
      if (!tashqiMaydonIdlar.has(id)) continue;
      const a = eski[id] ?? null;
      const c = yangiMaydonlar[id] ?? null;
      if (JSON.stringify(a) === JSON.stringify(c)) continue;
      maydonOzgardi = true;
      hodisalar.push({ type: 'field', data: { fieldId: id, before: a, after: c, sync: p.manba } });
    }
    if (maydonOzgardi) ozg.fields = yangiMaydonlar;

    if (Object.keys(ozg).length === 0) continue;
    await tx
      .update(deal)
      .set({ ...ozg, version: sql`${deal.version} + 1`, updatedAt: new Date() })
      .where(eq(deal.id, bor.id));
    if (hodisalar.length) {
      await tx.insert(dealEvent).values(hodisalar.map((h) => ({ businessId: p.businessId, dealId: bor.id, type: h.type, data: h.data, authorUserId: null })));
    }
    yangilandi++;
  }
  return { yangi, yangilandi };
}

/**
 * Bitim tashqi CRM dan sinxronlanayaptimi (ulanish faol va ko'chirish yoqiq).
 * Shunday bo'lsa asosiy maydonlari SotuvAI da o'zgartirilmaydi.
 */
export async function tashqiSinxronmi(tx: Tx, integrationId: string | null): Promise<string | null> {
  if (!integrationId) return null;
  const [u] = await tx
    .select({ kind: integration.kind, status: integration.status, config: integration.config })
    .from(integration)
    .where(eq(integration.id, integrationId))
    .limit(1);
  if (!u || (u.status !== 'connected' && u.status !== 'error')) return null;
  const lid = ((u.config ?? {}) as { crmLid?: { ichkiCrm?: boolean } }).crmLid;
  if (lid?.ichkiCrm === false) return null;
  return u.kind === 'amocrm' ? 'amoCRM' : u.kind === 'bitrix24' ? 'Bitrix24' : String(u.kind);
}

/**
 * Biznesda faol tashqi → ichki sinxron bormi (qo'ng'iroqlardan qabulni
 * o'chirish uchun). Bor bo'lsa — CRM nomi, yo'q bo'lsa null.
 */
export async function faolTashqiSinxBormi(tx: Tx): Promise<string | null> {
  const r = await tx
    .select({ kind: integration.kind, config: integration.config })
    .from(integration)
    .where(and(inArray(integration.kind, ['amocrm', 'bitrix24']), inArray(integration.status, ['connected', 'error'])));
  const u = r.find((x) => ((x.config ?? {}) as { crmLid?: { ichkiCrm?: boolean } }).crmLid?.ichkiCrm !== false);
  return u ? (u.kind === 'amocrm' ? 'amoCRM' : 'Bitrix24') : null;
}
