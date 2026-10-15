import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AuthContext, BusinessAccess } from '../auth/context.js';
import type { AccessInfo } from './oauth.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MCP SERVER — rahbar platformani o'z Claude'idan boshqaradi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ASOSIY QAROR: har vosita mavjud REST API'ni foydalanuvchining O'Z Bearer
 * tokeni bilan chaqiradi (`app.inject`). Natijada:
 *   • ruxsatlar (rahbar hammasini, sotuvchi faqat o'zini), tenant izolatsiyasi,
 *     validatsiya va audit — saytdagi bilan AYNAN bir xil, qayta yozilmaydi;
 *   • yangi endpoint qo'shilsa, vosita qo'shish — bitta chaqiruv;
 *   • «faqat o'qish» ruxsatida yozuv so'rovi auth qatlamida to'xtaydi.
 *
 * Har so'rovga yangi server (stateless) — holat saqlanmaydi, gorizontal
 * kengayish oson va bir foydalanuvchi boshqasining kontekstini ko'ra olmaydi.
 */

export interface McpKontekst {
  app: FastifyInstance;
  token: string;
  auth: AuthContext;
  oauth: AccessInfo;
}

class VositaXatosi extends Error {}

const MAX_MATN = 60_000;

function javob(data: unknown, izoh?: string): CallToolResult {
  let matn = JSON.stringify(data, null, 1);
  if (matn.length > MAX_MATN) matn = `${matn.slice(0, MAX_MATN)}\n… (natija qisqartirildi — filtr yoki limit bilan toraytiring)`;
  return { content: [{ type: 'text', text: izoh ? `${izoh}\n\n${matn}` : matn }] };
}

function xato(m: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: m }] };
}

/** REST API'ni foydalanuvchi nomidan chaqiradi; xato bo'lsa — tushunarli matn. */
async function api<T = unknown>(k: McpKontekst, method: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, body?: unknown): Promise<T> {
  const r = await k.app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${k.token}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    payload: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (r.statusCode >= 400) {
    let m = `HTTP ${r.statusCode}`;
    try {
      const j = r.json() as { title?: string; detail?: string; errors?: Record<string, string[]> };
      m = [j.title, j.detail, j.errors ? JSON.stringify(j.errors) : null].filter(Boolean).join(' — ') || m;
    } catch {
      /* JSON emas */
    }
    if (r.statusCode === 403) m = `Ruxsat yo'q: ${m}`;
    if (r.statusCode === 404) m = `Topilmadi: ${m}`;
    throw new VositaXatosi(m);
  }
  return (r.body ? r.json() : null) as T;
}

/** Biznesni tanlash: id, nom bo'lagi yoki (bitta bo'lsa) o'zi. */
function biznes(k: McpKontekst, arg?: string): BusinessAccess {
  const b = k.auth.businesses;
  if (b.length === 0) throw new VositaXatosi('Sizda hech qanday biznes yo\'q');
  if (!arg) {
    if (b.length === 1) return b[0]!;
    throw new VositaXatosi(`Bir nechta biznes bor — «business» parametrini bering: ${b.map((x) => `${x.name} (${x.businessId})`).join(', ')}`);
  }
  const a = arg.trim().toLowerCase();
  const topildi = b.find((x) => x.businessId === arg) ?? b.find((x) => x.name.toLowerCase() === a) ?? b.find((x) => x.name.toLowerCase().includes(a));
  if (!topildi) throw new VositaXatosi(`«${arg}» biznesi topilmadi. Mavjud: ${b.map((x) => x.name).join(', ')}`);
  return topildi;
}

const yol = (b: BusinessAccess) => `/api/v1/businesses/${b.businessId}`;

/** Menejerni id yoki ism bo'yicha topadi. */
async function menejer(k: McpKontekst, b: BusinessAccess, arg: string): Promise<{ id: string; displayName: string }> {
  const seats = await api<{ id: string; displayName: string; isActive: boolean }[]>(k, 'GET', `${yol(b)}/seats`);
  const a = arg.trim().toLowerCase();
  const t = seats.find((s) => s.id === arg) ?? seats.find((s) => s.displayName.toLowerCase() === a) ?? seats.find((s) => s.displayName.toLowerCase().includes(a));
  if (!t) throw new VositaXatosi(`«${arg}» menejeri topilmadi. Mavjud: ${seats.map((s) => s.displayName).join(', ')}`);
  return t;
}

function davr(kun: number): string {
  const to = new Date();
  const from = new Date(to.getTime() - kun * 86_400_000);
  return `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
}

const qs = (o: Record<string, string | number | undefined | null>) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([key, v]) => `${key}=${encodeURIComponent(String(v))}`)
    .join('&');

const toshkentSana = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());

const bizArg = z.string().optional().describe('Biznes nomi yoki ID. Foydalanuvchida bitta biznes bo\'lsa, bermasa ham bo\'ladi.');
const kunArg = (standart: number) => z.number().int().min(1).max(365).default(standart).describe(`Necha kunlik davr (standart ${standart})`);

const KO_RSATMA = `Bu — «Sotuv Intellekti» platformasi: sotuv bo'limining qo'ng'iroq va yozishmalarini kompaniya playbook'i bo'yicha baholaydi.

Asosiy tamoyil — ISBOT: har ball suhbatdagi aniq iqtibos (evidenceQuote) bilan tasdiqlanadi; iqtibos topilmagan ball bekor qilinadi (score = null, isFlagged). Foydalanuvchiga xulosa berganda ballarni iqtiboslar bilan asoslang, ballsiz mezonni «0» deb talqin qilmang — u «aniqlanmadi».

Ma'lumot foydalanuvchining huquqlari doirasida: rahbar butun jamoani, sotuvchi faqat o'zini ko'radi. Javoblarni foydalanuvchi tilida (odatda o'zbek tilida) bering.
Vositalar: avval list_businesses / get_team_overview, keyin chuqurlashing (get_manager_report, list_conversations → get_conversation).
O'zgartiruvchi vositalar (create_task, update_alert va h.k.) faqat foydalanuvchi aniq so'raganda ishlatilsin.`;

export function mcpServerYasa(k: McpKontekst): McpServer {
  const server = new McpServer(
    { name: 'sotuv-intellekti', title: 'Sotuv Intellekti', version: '1.0.0' },
    { instructions: KO_RSATMA },
  );
  const yozaOladi = k.oauth.scope.includes('write');

  /** Har vosita uchun xato chegarasi — xom stack trace modelga ketmaydi. */
  const ishla =
    <A,>(fn: (a: A) => Promise<CallToolResult>) =>
    async (a: A): Promise<CallToolResult> => {
      try {
        return await fn(a);
      } catch (e) {
        return xato(e instanceof VositaXatosi ? e.message : 'Ichki xato — keyinroq qayta urinib ko\'ring');
      }
    };
  const oqish = { readOnlyHint: true, openWorldHint: false } as const;

  // ═══ O'QISH ═══════════════════════════════════════════════════════════

  server.registerTool(
    'list_businesses',
    { title: 'Bizneslar', description: 'Foydalanuvchi kira oladigan bizneslar va undagi roli (owner, supervisor, manager …).', inputSchema: {}, annotations: oqish },
    ishla(async () =>
      javob({
        foydalanuvchi: k.auth.user.displayName,
        ruxsat: k.oauth.scope.includes('write') ? "o'qish va boshqarish" : "faqat o'qish",
        bizneslar: k.auth.businesses.map((b) => ({ id: b.businessId, nom: b.name, rol: b.role, rahbar: b.permissions.includes('analytics:read:all') })),
      }),
    ),
  );

  server.registerTool(
    'get_team_overview',
    {
      title: 'Jamoa ko\'rsatkichlari',
      description: 'Jamoa KPI (suhbatlar soni, o\'rtacha ball, javob tezligi), menejerlar reytingi va mezonlar bo\'yicha o\'rtachalar. Rahbar uchun boshlang\'ich nuqta.',
      inputSchema: { business: bizArg, days: kunArg(7) },
      annotations: oqish,
    },
    ishla(async ({ business, days }) => {
      const b = biznes(k, business);
      const d = davr(days);
      const [kpi, reyting, mezonlar] = await Promise.all([
        api(k, 'GET', `${yol(b)}/dashboard/kpi?${d}`),
        api(k, 'GET', `${yol(b)}/dashboard/leaderboard?${d}`),
        api(k, 'GET', `${yol(b)}/dashboard/criteria?${d}`),
      ]);
      return javob({ biznes: b.name, davr_kun: days, kpi, reyting, mezonlar });
    }),
  );

  server.registerTool(
    'list_managers',
    { title: 'Menejerlar', description: 'Menejerlar (sotuvchilar) ro\'yxati: ism, faolligi, suhbatlar soni, o\'rtacha ball, oxirgi suhbat.', inputSchema: { business: bizArg }, annotations: oqish },
    ishla(async ({ business }) => {
      const b = biznes(k, business);
      const seats = await api<Record<string, unknown>[]>(k, 'GET', `${yol(b)}/seats`);
      return javob(
        seats.map((s) => ({ id: s.id, ism: s.displayName, faol: s.isActive, suhbatlar: s.totalConversations, ortacha_ball: s.avgScore, oxirgi_suhbat: s.lastConversationAt })),
      );
    }),
  );

  server.registerTool(
    'get_manager_report',
    {
      title: 'Menejer hisoboti',
      description: 'Bitta menejerning batafsil ko\'rsatkichlari: mezonlar bo\'yicha kuchli va zaif tomonlari, trend, so\'nggi suhbatlar.',
      inputSchema: { business: bizArg, manager: z.string().describe('Menejer ismi yoki ID'), days: kunArg(30) },
      annotations: oqish,
    },
    ishla(async ({ business, manager, days }) => {
      const b = biznes(k, business);
      const m = await menejer(k, b, manager);
      return javob({ menejer: m.displayName, ...((await api(k, 'GET', `${yol(b)}/dashboard/seats/${m.id}?${davr(days)}`)) as object) });
    }),
  );

  server.registerTool(
    'list_conversations',
    {
      title: 'Suhbatlar',
      description: 'Suhbatlar (qo\'ng\'iroq va yozishmalar) ro\'yxati: sana, menejer, ball, holat. Batafsil ko\'rish uchun get_conversation.',
      inputSchema: {
        business: bizArg,
        manager: z.string().optional().describe('Menejer ismi yoki ID'),
        status: z.enum(['received', 'filtered', 'queued', 'transcribing', 'analyzing', 'done', 'failed']).optional().describe('done — baholanganlar'),
        limit: z.number().int().min(1).max(100).default(20),
      },
      annotations: oqish,
    },
    ishla(async ({ business, manager, status, limit }) => {
      const b = biznes(k, business);
      const seatId = manager ? (await menejer(k, b, manager)).id : undefined;
      return javob(await api(k, 'GET', `${yol(b)}/conversations?${qs({ seatId, status, limit })}`));
    }),
  );

  server.registerTool(
    'get_conversation',
    {
      title: 'Suhbat tafsiloti',
      description: 'Bitta suhbat: transkript, mezonlar bo\'yicha ballar va har birining ISBOT iqtibosi, xulosa, kouching tavsiyalari, va\'dalar.',
      inputSchema: {
        business: bizArg,
        conversation_id: z.string().uuid(),
        include_transcript: z.boolean().default(true).describe('Transkriptni qo\'shish (uzun bo\'lishi mumkin)'),
      },
      annotations: oqish,
    },
    ishla(async ({ business, conversation_id, include_transcript }) => {
      const b = biznes(k, business);
      const d = (await api<Record<string, unknown>>(k, 'GET', `${yol(b)}/conversations/${conversation_id}`)) ?? {};
      if (!include_transcript) delete d.segments;
      else if (Array.isArray(d.segments) && d.segments.length > 150) d.segments = [...d.segments.slice(0, 150), { izoh: `… yana ${d.segments.length - 150} qator` }];
      return javob(d);
    }),
  );

  server.registerTool(
    'list_alerts',
    {
      title: 'Ogohlantirishlar',
      description: 'Ogohlantirishlar: qizil bayroq, javobsiz mijoz, muddati o\'tgan va\'da, past baho, AI ishonchi past.',
      inputSchema: {
        business: bizArg,
        status: z.enum(['active', 'new', 'seen', 'resolved']).default('active').describe('active — hal qilinmaganlar'),
        kind: z.enum(['red_flag', 'quality_drop', 'missed_lead', 'broken_commitment', 'sync_error', 'low_confidence']).optional(),
        limit: z.number().int().min(1).max(200).default(30),
      },
      annotations: oqish,
    },
    ishla(async ({ business, status, kind, limit }) => {
      const b = biznes(k, business);
      return javob(await api(k, 'GET', `${yol(b)}/alerts?${qs({ status, kind, limit })}`));
    }),
  );

  server.registerTool(
    'list_tasks',
    {
      title: 'Vazifalar',
      description: 'Menejerlar vazifalari (AI suhbatdan ajratgan va qo\'lda qo\'shilgan).',
      inputSchema: {
        business: bizArg,
        status: z.enum(['pending', 'in_progress', 'done', 'cancelled', 'blocked']).optional(),
        view: z.enum(['today', 'overdue']).optional().describe('today — bugungi, overdue — muddati o\'tgan'),
        manager: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(30),
      },
      annotations: oqish,
    },
    ishla(async ({ business, status, view, manager, limit }) => {
      const b = biznes(k, business);
      const seatId = manager ? (await menejer(k, b, manager)).id : undefined;
      return javob(await api(k, 'GET', `${yol(b)}/tasks?${qs({ status, view, seatId, limit })}`));
    }),
  );

  server.registerTool(
    'get_daily_report',
    {
      title: 'Kunlik hisobot',
      description: 'Bir kunlik hisobot: suhbatlar, ballar, menejerlar tahlili, xavflar. Sana berilmasa — bugun (Toshkent vaqti).',
      inputSchema: { business: bizArg, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD') },
      annotations: oqish,
    },
    ishla(async ({ business, date }) => {
      const b = biznes(k, business);
      return javob(await api(k, 'GET', `${yol(b)}/reports/daily/day?${qs({ date: date ?? toshkentSana() })}`));
    }),
  );

  const BOLIMLAR = ['overview', 'quality', 'coaching', 'leads', 'funnel', 'tasks', 'activity', 'customer', 'clients', 'team', 'mix', 'voice'] as const;
  server.registerTool(
    'get_analytics',
    {
      title: 'Analitika',
      description:
        'Chuqur analitika bo\'limlari: overview (umumiy), quality (sifat), coaching (kouching ehtiyojlari), leads (lidlar), funnel (voronka), tasks, activity (faollik), customer/clients (mijozlar), team (jamoa), mix (suhbat turlari), voice (ovoz/nutq).',
      inputSchema: { business: bizArg, section: z.enum(BOLIMLAR), days: kunArg(30) },
      annotations: oqish,
    },
    ishla(async ({ business, section, days }) => {
      const b = biznes(k, business);
      return javob(await api(k, 'GET', `${yol(b)}/analytics/${section}?${davr(days)}`));
    }),
  );

  server.registerTool(
    'list_leads',
    {
      title: 'Lidlar',
      description: 'Mijozlar (lidlar) holati: bitimli, faol, sovimoqda, sovigan — oxirgi aloqa va imkoniyat bilan.',
      inputSchema: {
        business: bizArg,
        status: z.enum(['bitimli', 'faol', 'sovimoqda', 'sovigan']).optional(),
        manager: z.string().optional(),
        sort: z.enum(['sana', 'imkoniyat']).default('sana'),
        limit: z.number().int().min(1).max(200).default(30),
      },
      annotations: oqish,
    },
    ishla(async ({ business, status, manager, sort, limit }) => {
      const b = biznes(k, business);
      const seatId = manager ? (await menejer(k, b, manager)).id : undefined;
      return javob(await api(k, 'GET', `${yol(b)}/leads?${qs({ holat: status, seatId, sort, limit })}`));
    }),
  );

  server.registerTool(
    'get_playbook',
    { title: 'Playbook', description: 'Faol baholash playbook\'i: kategoriyalar, mezonlar va ularning vaznlari, qizil bayroqlar.', inputSchema: { business: bizArg }, annotations: oqish },
    ishla(async ({ business }) => javob(await api(k, 'GET', `${yol(biznes(k, business))}/playbook`))),
  );

  server.registerTool(
    'get_integrations_status',
    {
      title: 'Integratsiyalar holati',
      description: 'Moi Zvonki (navbat, baholangan, xatolar, bugungi limit, AI pauza), Telegram bot va CRM ulanishi holati.',
      inputSchema: { business: bizArg },
      annotations: oqish,
    },
    ishla(async ({ business }) => {
      const b = biznes(k, business);
      const xavfsiz = (url: string) => api(k, 'GET', url).catch((e: unknown) => ({ xato: e instanceof Error ? e.message : String(e) }));
      const [moizvonki, telegram, crm] = await Promise.all([
        xavfsiz(`${yol(b)}/integrations/moizvonki`),
        xavfsiz(`${yol(b)}/integrations/telegram`),
        xavfsiz(`${yol(b)}/integrations/crm`),
      ]);
      return javob({ moizvonki, telegram, crm });
    }),
  );

  // ═══ BOSHQARISH (faqat «write» ruxsati) ═══════════════════════════════
  // Ruxsat yo'q bo'lsa vositalar umuman ko'rsatilmaydi — Claude ularni
  // taklif qilib, keyin «ruxsat yo'q» olishidan ko'ra toza.

  if (yozaOladi) {
    const yozuv = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

    server.registerTool(
      'update_alert',
      {
        title: 'Ogohlantirishni belgilash',
        description: 'Ogohlantirishni «ko\'rildi» (seen) yoki «hal qilindi» (resolved) deb belgilaydi.',
        inputSchema: { business: bizArg, alert_id: z.string().uuid(), status: z.enum(['seen', 'resolved']) },
        annotations: { ...yozuv, idempotentHint: true },
      },
      ishla(async ({ business, alert_id, status }) => javob(await api(k, 'PATCH', `${yol(biznes(k, business))}/alerts/${alert_id}`, { status }), 'Belgilandi.')),
    );

    server.registerTool(
      'create_task',
      {
        title: 'Vazifa yaratish',
        description: 'Menejerga vazifa qo\'shadi (masalan, mijozga qayta qo\'ng\'iroq). Muddat ISO sanada.',
        inputSchema: {
          business: bizArg,
          title: z.string().min(3).max(300),
          description: z.string().max(2000).optional(),
          manager: z.string().optional().describe('Kimga — menejer ismi yoki ID'),
          conversation_id: z.string().uuid().optional().describe('Qaysi suhbatga bog\'liq'),
          due_at: z.string().optional().describe('Muddat, masalan 2026-10-20T15:00:00+05:00'),
        },
        annotations: yozuv,
      },
      ishla(async ({ business, title, description, manager, conversation_id, due_at }) => {
        const b = biznes(k, business);
        const seatId = manager ? (await menejer(k, b, manager)).id : undefined;
        return javob(await api(k, 'POST', `${yol(b)}/tasks`, { title, description, seatId, conversationId: conversation_id, dueAt: due_at }), 'Vazifa yaratildi.');
      }),
    );

    server.registerTool(
      'update_task',
      {
        title: 'Vazifani yangilash',
        description: 'Vazifa holati, nomi, muddati yoki ijrochisini o\'zgartiradi.',
        inputSchema: {
          business: bizArg,
          task_id: z.string().uuid(),
          status: z.enum(['pending', 'in_progress', 'done', 'cancelled', 'blocked']).optional(),
          title: z.string().min(3).max(300).optional(),
          due_at: z.string().nullable().optional(),
          manager: z.string().optional(),
        },
        annotations: { ...yozuv, idempotentHint: true },
      },
      ishla(async ({ business, task_id, status, title, due_at, manager }) => {
        const b = biznes(k, business);
        const seatId = manager ? (await menejer(k, b, manager)).id : undefined;
        return javob(await api(k, 'PATCH', `${yol(b)}/tasks/${task_id}`, { status, title, dueAt: due_at, seatId }), 'Vazifa yangilandi.');
      }),
    );

    server.registerTool(
      'add_conversation_comment',
      {
        title: 'Suhbatga izoh',
        description: 'Rahbar izohi (kouching) — menejer o\'z kabinetida ko\'radi. Mezon kodi berilsa, o\'sha mezonga bog\'lanadi.',
        inputSchema: { business: bizArg, conversation_id: z.string().uuid(), text: z.string().min(2).max(4000), criterion_code: z.string().max(16).optional() },
        annotations: yozuv,
      },
      ishla(async ({ business, conversation_id, text, criterion_code }) =>
        javob(await api(k, 'POST', `${yol(biznes(k, business))}/conversations/${conversation_id}/comments`, { body: text, criterionCode: criterion_code ?? null }), 'Izoh qo\'shildi.'),
      ),
    );

    server.registerTool(
      'sync_moizvonki',
      {
        title: 'Moi Zvonki sinxronlash',
        description: 'Moi Zvonki\'dan yangi qo\'ng\'iroqlarni hoziroq oladi (odatda har 2 daqiqada avtomatik).',
        inputSchema: { business: bizArg },
        annotations: { ...yozuv, idempotentHint: true, openWorldHint: true },
      },
      ishla(async ({ business }) => javob(await api(k, 'POST', `${yol(biznes(k, business))}/integrations/moizvonki/sync`, {}), 'Sinxronlandi.')),
    );

    server.registerTool(
      'reanalyze_conversation',
      {
        title: 'Qayta baholash',
        description: 'Suhbatni joriy playbook bo\'yicha AI bilan qayta baholaydi. AI xarajati bor — faqat foydalanuvchi so\'raganda.',
        inputSchema: { business: bizArg, conversation_id: z.string().uuid() },
        annotations: { ...yozuv, openWorldHint: true },
      },
      ishla(async ({ business, conversation_id }) =>
        javob(await api(k, 'POST', `${yol(biznes(k, business))}/conversations/${conversation_id}/analyze`, {}), 'Qayta baholashga yuborildi.'),
      ),
    );
  }

  // ═══ TAYYOR SO'ROVLAR ═════════════════════════════════════════════════

  server.registerPrompt(
    'weekly_review',
    {
      title: 'Haftalik jamoa sharhi',
      description: 'Oxirgi 7 kun: jamoa ko\'rsatkichlari, eng kuchli va zaif menejerlar, xavflar, keyingi hafta uchun 3 ta aniq harakat.',
      argsSchema: { business: z.string().optional() },
    },
    ({ business }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `${business ? `«${business}» biznesi uchun` : 'Mening biznesim uchun'} oxirgi 7 kunlik haftalik sharh tayyorla.
1) get_team_overview (days=7) bilan umumiy ko'rsatkichlar va reyting.
2) list_alerts (active) — hal qilinmagan xavflar; list_tasks (view=overdue) — muddati o'tganlar.
3) Eng past ballli 2 ta suhbatni get_conversation bilan och va muammoni ISBOT iqtiboslari bilan ko'rsat.
Natija: qisqa xulosa, jadval (menejer — suhbatlar — o'rtacha ball — zaif mezon), xavflar, keyingi hafta uchun 3 ta aniq harakat. O'zbek tilida.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'coach_manager',
    {
      title: 'Menejer uchun kouching rejasi',
      description: 'Bitta menejerning zaif mezonlari, aniq misollar (iqtiboslar) va 1 haftalik mashq rejasi.',
      argsSchema: { manager: z.string().describe('Menejer ismi'), business: z.string().optional() },
    },
    ({ manager, business }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `«${manager}» uchun kouching rejasi tuz${business ? ` («${business}» biznesi)` : ''}.
1) get_manager_report (days=30) — eng zaif 2–3 mezon.
2) list_conversations (manager=${manager}, status=done) dan zaif mezonlari past baholangan 3 ta suhbatni get_conversation bilan och.
3) Har zaif mezon uchun: suhbatdan aniq iqtibos (nima deyildi), nima deyish kerak edi (playbook bo'yicha), mashq.
Natija: 1 haftalik reja, kunlar kesimida. O'zbek tilida, menejerga to'g'ridan-to'g'ri murojaat qilib.`,
          },
        },
      ],
    }),
  );

  return server;
}
