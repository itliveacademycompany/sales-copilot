import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '../db/index.js';
import type { CrmDoira } from './xizmat.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HODISALAR LENTASI — amoCRM "События" namunasida
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bitta jadvalda butun CRM tarixi: bitim hodisalari (`deal_event` —
 * yaratildi, bosqich, maydon, izoh, mas'ul, teglar, vazifalar, o'chirish…)
 * va qo'ng'iroqlar (`conversation`, telefon). Eng yangisi tepada.
 *
 * Ko'rish doirasi: rahbar — hammasi; sotuvchi — o'zi mas'ul bitimlar va
 * o'zining qo'ng'iroqlari. Sahifalash — `limit` / `offset`.
 */

const BOSH_UUID = '00000000-0000-0000-0000-000000000000';

export const lentaSxemasi = z.object({
  q: z.string().trim().max(200).optional(),
  /** deal — bitim hodisalari, task — vazifalar, call — qo'ng'iroqlar. */
  object: z.enum(['deal', 'task', 'call']).optional(),
  /** Aniq hodisa turi: stage, field, note, responsible, tags, created, task, task_done… */
  type: z.string().max(40).optional(),
  /** Muallif — xodim (seat): uning foydalanuvchisi yozgan hodisalar va qo'ng'iroqlari. */
  seat: z.string().uuid().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(200_000).default(0),
});
export type LentaFiltr = z.infer<typeof lentaSxemasi>;

function qatorlar<T>(r: unknown): T[] {
  return ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as T[];
}

export async function hodisalarLentasi(tx: Tx, p: { doira: CrmDoira; f: LentaFiltr }) {
  const { doira, f } = p;
  const ozi = doira.korish === 'own' ? (doira.seatId ?? BOSH_UUID) : null;

  // ─── Bitim hodisalari ───
  const b: SQL[] = [sql`true`];
  if (ozi) b.push(sql`d.responsible_seat_id = ${ozi}`);
  if (f.from) b.push(sql`e.created_at >= ${f.from}`);
  if (f.to) b.push(sql`e.created_at < ${f.to}`);
  if (f.object === 'task') b.push(sql`e.type like 'task%'`);
  if (f.object === 'deal') b.push(sql`e.type not like 'task%'`);
  if (f.type) b.push(sql`e.type = ${f.type}`);
  if (f.seat) b.push(sql`e.author_user_id = (select se.user_id from seat se where se.id = ${f.seat})`);
  if (f.q) b.push(sql`(d.name ilike ${`%${f.q}%`} or u.display_name ilike ${`%${f.q}%`})`);
  const bitimSh = sql.join(b, sql` and `);

  // ─── Qo'ng'iroqlar ───
  const c: SQL[] = [sql`c.channel = 'phone'`];
  if (ozi) c.push(sql`c.seat_id = ${ozi}`);
  if (f.from) c.push(sql`c.started_at >= ${f.from}`);
  if (f.to) c.push(sql`c.started_at < ${f.to}`);
  if (f.type) c.push(sql`('call_' || c.direction) = ${f.type}`);
  if (f.seat) c.push(sql`c.seat_id = ${f.seat}`);
  if (f.q) c.push(sql`(ct.name ilike ${`%${f.q}%`} or ct.phone ilike ${`%${f.q}%`} or se.display_name ilike ${`%${f.q}%`})`);
  const qongiroqSh = sql.join(c, sql` and `);

  const bitimlar = f.object !== 'call';
  const qongiroqlar = !f.object || f.object === 'call';

  const bitimQism = sql`
    select e.id::text as id, e.created_at as at, u.display_name as author,
      case when e.type like 'task%' then 'task' else 'deal' end as object,
      e.deal_id::text as deal_id, null::text as contact_id, null::text as conversation_id,
      d.name as name, e.type as type, e.data as data, (d.deleted_at is not null) as deleted
    from deal_event e
    join deal d on d.id = e.deal_id
    left join app_user u on u.id = e.author_user_id
    where ${bitimSh}`;
  const qongiroqQism = sql`
    select c.id::text as id, c.started_at as at, se.display_name as author,
      'call' as object, null::text as deal_id, c.contact_id::text as contact_id, c.id::text as conversation_id,
      coalesce(nullif(ct.name, ''), ct.phone, 'Kontakt') as name, ('call_' || c.direction) as type,
      jsonb_build_object('duration', c.duration_seconds, 'mediaUrl', c.media_url, 'mediaKind', c.media_kind, 'phone', ct.phone) as data,
      false as deleted
    from conversation c
    left join contact ct on ct.id = c.contact_id
    left join seat se on se.id = c.seat_id
    where ${qongiroqSh}`;

  const qismlar = [...(bitimlar ? [bitimQism] : []), ...(qongiroqlar ? [qongiroqQism] : [])];
  if (!qismlar.length) return { total: 0, items: [] };
  const birlashma = sql.join(qismlar, sql` union all `);

  const [r, jami] = await Promise.all([
    tx.execute(sql`select * from (${birlashma}) x order by x.at desc, x.id desc limit ${f.limit} offset ${f.offset}`),
    tx.execute(sql`
      select
        ${bitimlar ? sql`(select count(*) from deal_event e join deal d on d.id = e.deal_id left join app_user u on u.id = e.author_user_id where ${bitimSh})` : sql`0`}
        + ${qongiroqlar ? sql`(select count(*) from conversation c left join contact ct on ct.id = c.contact_id left join seat se on se.id = c.seat_id where ${qongiroqSh})` : sql`0`}
        as n
    `),
  ]);

  return {
    total: Number(qatorlar<{ n: string | number }>(jami)[0]?.n ?? 0),
    items: qatorlar<Record<string, unknown>>(r).map((x) => ({
      id: x.id as string,
      at: new Date(x.at as string).toISOString(),
      author: (x.author as string | null) ?? null,
      object: x.object as 'deal' | 'task' | 'call',
      dealId: (x.deal_id as string | null) ?? null,
      contactId: (x.contact_id as string | null) ?? null,
      conversationId: (x.conversation_id as string | null) ?? null,
      name: (x.name as string | null) ?? '',
      type: x.type as string,
      data: (x.data as Record<string, unknown>) ?? {},
      deleted: Boolean(x.deleted),
    })),
  };
}
