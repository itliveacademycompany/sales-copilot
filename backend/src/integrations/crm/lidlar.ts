import { and, asc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { withoutTenantIsolation, withTenant, type Tx } from '../../db/index.js';
import { business, contact, crmLead, integration, seat } from '../../db/schema/index.js';
import { CrmXato, raqamlar, telefonKaliti, type CrmKontekst, type CrmLid, type CrmTuzilish } from './adapter.js';
import { ADAPTERLAR, CRM_TURLARI } from './index.js';
import { kontekstQur } from './kontekst.js';
import { lidlarniKochir, tashqiOchirilganlarniBelgila, tuzilmaniKochir, type TashqiXarita } from '../../crm/tashqi.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CRM LIDLARI — sdelkalarni SotuvAI ga olib kelish (worker tiki)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * OQIM (har ulangan CRM uchun, har daqiqada)
 * ──────────────────────────────────────────
 *   1. Adapter `lidlar(kursor)` — o'zgargan sdelkalar, eng eskisidan.
 *      Birinchi marta HAMMASI (bir necha tikda), keyin faqat o'zgarganlari.
 *   2. Voronka/bosqich nomi va turi (ochiq/muvaffaqiyat/yopilgan), mas'ul
 *      ismi — CRM tuzilishidan (10 daqiqa keshlanadi).
 *   3. Mijoz telefoni bo'yicha SotuvAI kontakti topiladi (oxirgi 9 raqam)
 *      yoki yaratiladi — shu orqali lidning qo'ng'iroqlari va tahlillari
 *      bog'lanadi. Mas'ul → menejer: kartochkadagi "CRM ID" orqali.
 *   4. `crm_lead` ga upsert (`integration_id + crm_id`), kursor saqlanadi.
 *
 * KAFOLATLAR
 * ──────────
 * • Kursor HAR sahifadan keyin saqlanadi — server qayta ishga tushsa ham
 *   import joyidan davom etadi, boshidan emas.
 * • Bitta lid ikki marta kelsa (chegaradagi vaqt) — upsert, dublikat yo'q.
 * • CRM ga hech narsa yozilmaydi — faqat o'qiladi.
 * • Doimiy xato (token bekor) — ulanish `error`, import to'xtaydi.
 * • Sozlamada voronkalar tanlangan bo'lsa — faqat ulardagi lidlar saqlanadi.
 *
 * O'CHIRILGAN SDELKALAR
 * ─────────────────────
 * CRM o'chirilgan sdelkani `lidlar()` da umuman qaytarmaydi, ya'ni o'zgarish
 * bo'yicha import uni hech qachon "ko'rmaydi". Shuning uchun har tikda
 * saqlangan lidlarning kichik bir bo'lagi CRM dan qayta so'raladi
 * (`ochirilganlarniTekshir`, kursor bilan aylanib); yo'qolganlari `crm_lead`
 * dan olib tashlanadi, ichki CRM bitimi esa savatga tushadi.
 */

/** Bir tikda bitta ulanish uchun ko'pi bilan shuncha sahifa (amoCRM: 250, Bitrix24: 50 tadan). */
const MAKS_SAHIFA = 4;
const TUZILISH_KESH_MS = 10 * 60_000;

export interface CrmLidSozlama {
  /** Adapter kursori — qayerdan davom etish. `null` — boshidan. */
  kursor: string | null;
  /** Faqat shu voronkalar (ID). `null` — hammasi. */
  voronkalar: string[] | null;
  /** Birinchi to'liq import tugaganmi. */
  birinchiTugadi: boolean;
  oxirgi: string | null;
  xato: string | null;
  /**
   * Lidlar SotuvAI ichki CRM bitimlariga ham ko'chirilsinmi (bir tomonlama
   * sinxron). Standart — ha: ulangan CRM ning hamma lidlari CRM bo'limida.
   */
  ichkiCrm: boolean;
  /** Ichki CRM ga birinchi to'liq ko'chirish boshlanganmi (bir marta qayta import). */
  ichkiBoshlangan: boolean;
  /** O'chirilganlar tekshiruvi qayerga yetdi (`crm_id`). `null` — boshidan. */
  ochirishKursor: string | null;
  /** Oxirgi to'liq aylanish tugagan vaqt. */
  ochirishTugadi: string | null;
}

export function lidSozlamaniOl(config: unknown): CrmLidSozlama {
  const c = ((config ?? {}) as Record<string, unknown>).crmLid as Partial<CrmLidSozlama> | undefined;
  return {
    kursor: typeof c?.kursor === 'string' ? c.kursor : null,
    voronkalar: Array.isArray(c?.voronkalar) ? c.voronkalar.map(String) : null,
    birinchiTugadi: c?.birinchiTugadi === true,
    oxirgi: typeof c?.oxirgi === 'string' ? c.oxirgi : null,
    xato: typeof c?.xato === 'string' ? c.xato : null,
    ichkiCrm: c?.ichkiCrm !== false,
    ichkiBoshlangan: c?.ichkiBoshlangan === true,
    ochirishKursor: typeof c?.ochirishKursor === 'string' ? c.ochirishKursor : null,
    ochirishTugadi: typeof c?.ochirishTugadi === 'string' ? c.ochirishTugadi : null,
  };
}

export interface LidSinxNatija {
  businessId: string;
  olindi: number;
  saqlandi: number;
  tugadi: boolean;
  /** Ichki CRM da yaratilgan yoki yangilangan bitimlar. */
  bitimlar?: number;
  /** CRM da o'chirilgani aniqlangan sdelkalar (lid nusxasi olib tashlandi). */
  ochirildi?: number;
  /** Shubhali javob tufayli o'chirilmay qoldirilganlar (izoh: `ochirilganlarniTekshir`). */
  ochirishOtkazildi?: number;
  xato?: string;
}

// ─── Tuzilish keshi ──────────────────────────────────────────────────────────

const kesh = new Map<string, { vaqt: number; t: CrmTuzilish }>();

async function tuzilishKesh(integrationId: string, kind: keyof typeof ADAPTERLAR, ctx: CrmKontekst): Promise<CrmTuzilish> {
  const bor = kesh.get(integrationId);
  if (bor && Date.now() - bor.vaqt < TUZILISH_KESH_MS) return bor.t;
  const t = await ADAPTERLAR[kind].tuzilish(ctx);
  kesh.set(integrationId, { vaqt: Date.now(), t });
  return t;
}

/** Sozlama o'zgarganda (voronka tanlovi, qayta ulanish) — keshni tozalash. */
export function tuzilishKeshniTozala(integrationId: string): void {
  kesh.delete(integrationId);
  xaritaKesh.delete(integrationId);
}

/**
 * Ichki CRM tuzilmasi (voronka/bosqich/maydon) — faqat tashqi tuzilma yoki
 * voronka tanlovi o'zgarganda qayta ko'chiriladi; aks holda keshdagi xarita.
 */
const xaritaKesh = new Map<string, { kalit: string; x: TashqiXarita }>();

async function tuzilmaXaritasi(
  businessId: string,
  integrationId: string,
  t: CrmTuzilish,
  voronkalar: string[] | null,
  birinchi: boolean,
  manba: string,
): Promise<TashqiXarita> {
  const kalit = JSON.stringify([t.pipelines, t.leadFields, voronkalar]);
  const bor = xaritaKesh.get(integrationId);
  if (bor && bor.kalit === kalit && !birinchi) return bor.x;
  const x = await withTenant(businessId, (tx) => tuzilmaniKochir(tx, { businessId, integrationId, t, voronkalar, birinchi, manba }));
  xaritaKesh.set(integrationId, { kalit, x });
  return x;
}

// ─── Yordamchilar ────────────────────────────────────────────────────────────

/**
 * Kontakt uchun telefon — Moi Zvonki bilan bir xil format (faqat raqamlar).
 * 9 xonali mahalliy raqamga `998` qo'shiladi: aks holda CRM dagi
 * `90 123 45 67` va qo'ng'iroqdagi `998901234567` ikki xil mijoz bo'lardi.
 */
export function kontaktTelefoni(t: string): string | null {
  const r = raqamlar(t);
  if (r.length === 9) return `998${r}`;
  return r.length >= 9 ? r : null;
}

function asosiyTelefon(l: CrmLid): string | null {
  for (const t of l.telefonlar) {
    if (telefonKaliti(t)) return t;
  }
  return null;
}

/**
 * Lidlar sahifasi uchun kontaktlar: mavjudlari oxirgi 9 raqam bo'yicha
 * topiladi, yo'qlari yaratiladi. Natija: telefon kaliti → kontakt ID.
 */
export async function kontaktlarniBogla(
  tx: Tx,
  businessId: string,
  lidlar: CrmLid[],
): Promise<Map<string, string>> {
  const kerak = new Map<string, { telefon: string; nom: string | null }>();
  for (const l of lidlar) {
    const t = asosiyTelefon(l);
    const k = telefonKaliti(t);
    if (t && k && !kerak.has(k)) kerak.set(k, { telefon: t, nom: l.kontaktNom });
  }
  const natija = new Map<string, string>();
  if (kerak.size === 0) return natija;

  const kalitlar = [...kerak.keys()];
  const bor = await tx
    .select({ id: contact.id, kalit: sql<string>`right(regexp_replace(${contact.phone}, '\\D', '', 'g'), 9)` })
    .from(contact)
    .where(
      and(
        eq(contact.businessId, businessId),
        inArray(sql`right(regexp_replace(${contact.phone}, '\\D', '', 'g'), 9)`, kalitlar),
      ),
    );
  for (const b of bor) if (!natija.has(b.kalit)) natija.set(b.kalit, b.id);

  const yangilar = kalitlar
    .filter((k) => !natija.has(k))
    .map((k) => ({ k, telefon: kontaktTelefoni(kerak.get(k)!.telefon), nom: kerak.get(k)!.nom }))
    .filter((x): x is { k: string; telefon: string; nom: string | null } => Boolean(x.telefon));
  if (yangilar.length > 0) {
    const hozir = new Date();
    const qatorlar = await tx
      .insert(contact)
      .values(yangilar.map((y) => ({ businessId, phone: y.telefon, name: y.nom, firstSeenAt: hozir, lastSeenAt: hozir })))
      .returning({ id: contact.id, phone: contact.phone });
    for (const q of qatorlar) {
      const k = telefonKaliti(q.phone);
      if (k) natija.set(k, q.id);
    }
  }
  return natija;
}

/** CRM lidini `crm_lead` qatoriga aylantiradi (nomlar tuzilishdan). */
export function lidQatori(
  l: CrmLid,
  p: {
    businessId: string;
    integrationId: string;
    kind: 'amocrm' | 'bitrix24';
    t: CrmTuzilish;
    seatlar: Map<string, string>;
    kontaktlar: Map<string, string>;
  },
) {
  const voronka = p.t.pipelines.find((v) => v.id === l.voronkaId);
  const bosqich = voronka?.statuses.find((s) => s.id === l.bosqichId);
  const telefon = asosiyTelefon(l);
  const kalit = telefonKaliti(telefon);
  return {
    businessId: p.businessId,
    integrationId: p.integrationId,
    kind: p.kind,
    crmId: l.id,
    name: l.nom,
    pipelineId: l.voronkaId,
    pipelineName: voronka?.name ?? null,
    stageId: l.bosqichId,
    stageName: bosqich?.name ?? null,
    stageType: bosqich?.tur ?? (l.yopilgan ? 'yopilgan' : 'ochiq'),
    amount: l.summa === null ? null : String(l.summa),
    responsibleCrmId: l.masulId,
    responsibleName: p.t.users.find((u) => u.id === l.masulId)?.name ?? null,
    seatId: l.masulId ? (p.seatlar.get(l.masulId) ?? null) : null,
    crmContactId: l.kontaktId,
    contactName: l.kontaktNom,
    phone: telefon ? kontaktTelefoni(telefon) : null,
    contactId: kalit ? (p.kontaktlar.get(kalit) ?? null) : null,
    url: l.url,
    crmCreatedAt: l.yaratilgan,
    crmUpdatedAt: l.yangilangan,
    closedAt: l.yopilgan,
    updatedAt: new Date(),
  };
}

/** `crm_lead` ga upsert + kontaktga CRM ID lari. Alohida — testda haqiqiy SQL sinaladi. */
export async function lidlarniSaqla(tx: Tx, qatorlar: ReturnType<typeof lidQatori>[]): Promise<number> {
  if (qatorlar.length === 0) return 0;
  await tx
    .insert(crmLead)
    .values(qatorlar)
    .onConflictDoUpdate({
      target: [crmLead.integrationId, crmLead.crmId],
      set: {
        name: sql`excluded.name`,
        pipelineId: sql`excluded.pipeline_id`,
        pipelineName: sql`excluded.pipeline_name`,
        stageId: sql`excluded.stage_id`,
        stageName: sql`excluded.stage_name`,
        stageType: sql`excluded.stage_type`,
        amount: sql`excluded.amount`,
        responsibleCrmId: sql`excluded.responsible_crm_id`,
        responsibleName: sql`excluded.responsible_name`,
        seatId: sql`excluded.seat_id`,
        crmContactId: sql`excluded.crm_contact_id`,
        contactName: sql`excluded.contact_name`,
        phone: sql`excluded.phone`,
        contactId: sql`coalesce(excluded.contact_id, ${crmLead.contactId})`,
        url: sql`excluded.url`,
        crmCreatedAt: sql`excluded.crm_created_at`,
        crmUpdatedAt: sql`excluded.crm_updated_at`,
        closedAt: sql`excluded.closed_at`,
        updatedAt: sql`now()`,
      },
    });
  // Kontaktga eng so'nggi lid — qo'ng'iroq sahifasidan CRM ga o'tish uchun
  for (const q of qatorlar) {
    if (!q.contactId) continue;
    await tx
      .update(contact)
      .set({ crmContactId: q.crmContactId, crmLeadId: q.crmId })
      .where(eq(contact.id, q.contactId));
  }
  return qatorlar.length;
}

/**
 * `integration.config.crmLid` ni BOSHQA sozlamalarga tegmasdan yangilaydi:
 * import davomida rahbar CRM sahifasida sozlamani o'zgartirsa, o'chib ketmasin.
 */
export function lidHolatSorovi(tx: Tx, integrationId: string, qism: Partial<CrmLidSozlama>) {
  return tx
    .update(integration)
    .set({
      config: sql`${integration.config} || jsonb_build_object('crmLid', coalesce(${integration.config}->'crmLid', '{}'::jsonb) || ${JSON.stringify(qism)}::jsonb)`,
      updatedAt: new Date(),
    })
    .where(eq(integration.id, integrationId));
}

async function holatniYoz(businessId: string, integrationId: string, qism: Partial<CrmLidSozlama>): Promise<void> {
  await withTenant(businessId, (tx) => lidHolatSorovi(tx, integrationId, qism));
}

// ─── Asosiy tik ──────────────────────────────────────────────────────────────

export async function crmLidlarniSinxronla(opts: { businessId?: string; maksSahifa?: number } = {}): Promise<LidSinxNatija[]> {
  const ulanishlar = await withoutTenantIsolation('CRM lidlari: ulangan CRM lar', (tx) =>
    tx
      .select({
        id: integration.id,
        businessId: integration.businessId,
        kind: integration.kind,
        config: integration.config,
        creds: integration.credentialsEncrypted,
      })
      .from(integration)
      .innerJoin(business, eq(business.id, integration.businessId))
      .where(
        and(
          inArray(integration.kind, CRM_TURLARI),
          eq(integration.status, 'connected'),
          eq(integration.syncEnabled, true),
          isNull(business.deletedAt),
          isNull(business.suspendedAt),
          opts.businessId ? eq(integration.businessId, opts.businessId) : undefined,
        ),
      ),
  );

  const natijalar: LidSinxNatija[] = [];
  for (const u of ulanishlar) {
    const kind = u.kind as 'amocrm' | 'bitrix24';
    const ctx = kontekstQur({ id: u.id, businessId: u.businessId, config: u.config, creds: u.creds });
    if (!ctx) continue;
    const n: LidSinxNatija = { businessId: u.businessId, olindi: 0, saqlandi: 0, tugadi: false };
    natijalar.push(n);
    try {
      await bittaUlanish(u, kind, ctx, opts.maksSahifa ?? MAKS_SAHIFA, n);
    } catch (err) {
      const xabar = err instanceof Error ? err.message : String(err);
      n.xato = xabar;
      await holatniYoz(u.businessId, u.id, { xato: xabar });
      if (err instanceof CrmXato && err.doimiy) {
        await withTenant(u.businessId, (tx) =>
          tx
            .update(integration)
            .set({ status: 'error', lastError: xabar, lastSyncStatus: 'error', lastSyncAt: new Date(), updatedAt: new Date() })
            .where(eq(integration.id, u.id)),
        );
      }
    }
  }
  return natijalar;
}

async function bittaUlanish(
  u: { id: string; businessId: string; config: unknown },
  kind: 'amocrm' | 'bitrix24',
  ctx: CrmKontekst,
  maksSahifa: number,
  n: LidSinxNatija,
): Promise<void> {
  const sozlama = lidSozlamaniOl(u.config);
  const t = await tuzilishKesh(u.id, kind, ctx);

  // Ichki CRM ga birinchi ko'chirish: lidlar boshidan (qo'shimcha maydonlari
  // bilan) qayta olinadi — avval import qilinganlari ham bitim bo'lsin
  const birinchiKochirish = sozlama.ichkiCrm && !sozlama.ichkiBoshlangan;
  if (birinchiKochirish) {
    sozlama.kursor = null;
    sozlama.birinchiTugadi = false;
  }
  const manba = ADAPTERLAR[kind].nom;
  const xarita = sozlama.ichkiCrm
    ? await tuzilmaXaritasi(u.businessId, u.id, t, sozlama.voronkalar, birinchiKochirish, manba)
    : null;
  if (birinchiKochirish) {
    sozlama.ichkiBoshlangan = true;
    await holatniYoz(u.businessId, u.id, { ichkiBoshlangan: true, kursor: null, birinchiTugadi: false });
  }

  // Mas'ul (CRM foydalanuvchisi) → menejer: kartochkadagi "CRM ID"
  const seatQatorlari = await withTenant(u.businessId, (tx) =>
    tx
      .select({ id: seat.id, crm: sql<string | null>`${seat.externalIds}->>'crm'` })
      .from(seat)
      .where(sql`${seat.externalIds}->>'crm' is not null`),
  );
  const seatlar = new Map(seatQatorlari.filter((s) => s.crm).map((s) => [s.crm!.trim(), s.id]));

  let kursor = sozlama.kursor;
  for (let i = 0; i < maksSahifa; i++) {
    const sahifa = await ADAPTERLAR[kind].lidlar(ctx, kursor);
    n.olindi += sahifa.lidlar.length;
    const kerakli = sozlama.voronkalar
      ? sahifa.lidlar.filter((l) => l.voronkaId !== null && sozlama.voronkalar!.includes(l.voronkaId))
      : sahifa.lidlar;

    n.saqlandi += await withTenant(u.businessId, async (tx) => {
      const kontaktlar = await kontaktlarniBogla(tx, u.businessId, kerakli);
      const qatorlar = kerakli.map((l) =>
        lidQatori(l, { businessId: u.businessId, integrationId: u.id, kind, t, seatlar, kontaktlar }),
      );
      const saqlandi = await lidlarniSaqla(tx, qatorlar);
      if (xarita) {
        // Shu tranzaksiyada ichki CRM bitimlari ham — lid va bitim bir-biridan orqada qolmaydi
        const lidKontakt = new Map(qatorlar.filter((q) => q.contactId).map((q) => [q.crmId, q.contactId!]));
        const r = await lidlarniKochir(tx, {
          businessId: u.businessId,
          integrationId: u.id,
          manba,
          lidlar: kerakli,
          xarita,
          seatlar,
          kontaktlar: lidKontakt,
        });
        n.bitimlar = (n.bitimlar ?? 0) + r.yangi + r.yangilandi;
      }
      return saqlandi;
    });

    kursor = sahifa.kursor;
    const birinchiTugadi = sozlama.birinchiTugadi || sahifa.tugadi;
    await holatniYoz(u.businessId, u.id, { kursor, birinchiTugadi, oxirgi: new Date().toISOString(), xato: null });
    sozlama.birinchiTugadi = birinchiTugadi;
    if (sahifa.tugadi) {
      n.tugadi = true;
      break;
    }
  }

  await ochirilganlarniTekshir(u, kind, ctx, sozlama, manba, n);
}

// ─── O'chirilgan sdelkalar ───────────────────────────────────────────────────

/** Bir tikda CRM dan qayta so'raladigan saqlangan lidlar (amoCRM: 2 so'rov, Bitrix24: 4). */
export const OCHIRISH_BOLAK = 200;
/** To'liq aylanib chiqqach yangi aylanishgacha tanaffus — CRM so'rov limitini tejash. */
const OCHIRISH_TANAFFUS_MS = 15 * 60_000;
/** Bo'lak shundan katta bo'lib, HAMMASI "yo'q" chiqsa — shubhali (pastdagi izoh). */
const SHUBHALI_KAMIDA = 20;

/**
 * Bo'lakdagi qaysi ID lar o'chirilgan deb hisoblanadi. Agar katta bo'lakning
 * HAMMASI yo'q chiqsa — bu ko'pincha CRM tomonidagi muammo (ruxsat
 * o'zgargan, API javobi o'zgargan), haqiqiy ommaviy o'chirish emas: bitta
 * xato javob butun bitimlar bazasini savatga tushirmasin. Bunday holatda
 * hech narsa o'chirilmaydi; kichik bo'lakda esa ishonchli.
 */
export function ochirilganlarniAjrat(idlar: string[], bor: Set<string>): { ochirilgan: string[]; shubhali: boolean } {
  const yoq = idlar.filter((id) => !bor.has(id));
  const shubhali = yoq.length > 0 && yoq.length === idlar.length && idlar.length >= SHUBHALI_KAMIDA;
  return { ochirilgan: shubhali ? [] : yoq, shubhali };
}

async function ochirilganlarniTekshir(
  u: { id: string; businessId: string },
  kind: 'amocrm' | 'bitrix24',
  ctx: CrmKontekst,
  sozlama: CrmLidSozlama,
  manba: string,
  n: LidSinxNatija,
): Promise<void> {
  // Birinchi import davomida emas — hali hamma lid kelmagan.
  if (!sozlama.birinchiTugadi) return;
  if (!sozlama.ochirishKursor && sozlama.ochirishTugadi && Date.now() - Date.parse(sozlama.ochirishTugadi) < OCHIRISH_TANAFFUS_MS) return;

  const qatorlar = await withTenant(u.businessId, (tx) =>
    tx
      .select({ id: crmLead.crmId })
      .from(crmLead)
      .where(and(eq(crmLead.integrationId, u.id), sozlama.ochirishKursor ? gt(crmLead.crmId, sozlama.ochirishKursor) : undefined))
      .orderBy(asc(crmLead.crmId))
      .limit(OCHIRISH_BOLAK),
  );
  const idlar = qatorlar.map((q) => q.id);

  if (idlar.length > 0) {
    let bor: Set<string>;
    try {
      bor = await ADAPTERLAR[kind].mavjudLidlar(ctx, idlar);
    } catch (err) {
      // Doimiy xato (token bekor) — tashqi ishlovchi ulanishni `error` qiladi.
      // Vaqtinchalik xato — keyingi tikda shu bo'lak qayta tekshiriladi.
      if (err instanceof CrmXato && err.doimiy) throw err;
      return;
    }
    const { ochirilgan, shubhali } = ochirilganlarniAjrat(idlar, bor);
    if (shubhali) n.ochirishOtkazildi = idlar.length;
    if (ochirilgan.length > 0) {
      n.ochirildi = ochirilgan.length;
      await withTenant(u.businessId, async (tx) => {
        await tx.delete(crmLead).where(and(eq(crmLead.integrationId, u.id), inArray(crmLead.crmId, ochirilgan)));
        await tashqiOchirilganlarniBelgila(tx, { businessId: u.businessId, integrationId: u.id, manba, idlar: ochirilgan });
      });
    }
  }

  const oxiri = idlar.length < OCHIRISH_BOLAK;
  await holatniYoz(
    u.businessId,
    u.id,
    oxiri ? { ochirishKursor: null, ochirishTugadi: new Date().toISOString() } : { ochirishKursor: idlar[idlar.length - 1]! },
  );
}
