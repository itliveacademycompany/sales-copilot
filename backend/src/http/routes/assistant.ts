import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getActiveLlm, LlmSozlanmaganError } from '../../ai/llm.js';
import { requireBusiness } from '../auth-plugin.js';
import { AppError } from '../errors.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AI YORDAMCHI (TZ 3.9) — erkin savolga platforma ma'lumotidan javob
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Avval AI Chat sahifasi faqat 6 ta oldindan belgilangan mavzuni tanirdi
 * (kalit so'z bo'yicha), qolganiga "AI yordamchi server tomonda ulanmagan"
 * derdi. Bu endpoint shu bo'shliqni yopadi.
 *
 * XAVFSIZLIK — ma'lumot foydalanuvchining O'Z sessiyasi bilan olinadi:
 * kontekst mavjud REST endpointlarni `app.inject` orqali, so'rovdagi cookie
 * bilan chaqirib yig'iladi (MCP serveridagi bilan bir xil tamoyil). Demak
 * rahbar butun jamoani, sotuvchi faqat o'zini ko'radi — RBAC va tenant
 * izolyatsiyasi qayta yozilmaydi va chetlab o'tilmaydi. Ruxsat yo'q bo'lim
 * jimgina tushib qoladi, model esa "bu ma'lumot sizga ochiq emas" deydi.
 *
 * MODEL ma'lumotni O'YLAB TOPMASLIGI uchun: javob faqat berilgan kontekstdan,
 * yo'q narsa "ma'lumot yo'q" deb aytiladi. Tezlik va token uchun Z.ai'da
 * `reasoning_effort = low` (qisqa javobda bir necha soniya).
 */

const chatBody = z.object({
  savol: z.string().trim().min(1).max(2000),
  tarix: z
    .array(z.object({ rol: z.enum(['men', 'yordamchi']), matn: z.string().max(4000) }))
    .max(12)
    .default([]),
});

const javobSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['javob'],
  properties: { javob: { type: 'string', description: 'Foydalanuvchiga javob (Markdown emas, oddiy matn, ro\'yxat uchun "• ")' } },
} satisfies Record<string, unknown>;
const javobZod = z.object({ javob: z.string().min(1) });

const SYSTEM = `Sen «SotuvAI» platformasining AI yordamchisisan. Platforma sotuv bo'limi qo'ng'iroqlari va yozishmalarini kompaniya playbook'i bo'yicha baholaydi (har ball suhbatdagi iqtibos bilan tasdiqlanadi).

QOIDALAR:
- Faqat pastdagi MA'LUMOT blokidan foydalan. U yerda yo'q raqam, ism yoki faktni O'YLAB TOPMA — "bu haqda ma'lumot yo'q" de va qaysi bo'limda ko'rish mumkinligini ayt (Qo'ng'iroqlar, Analitika, Vazifalar, Ogohlantirishlar).
- Agar bo'lim "ruxsat yo'q" deb belgilangan bo'lsa — foydalanuvchiga bu ma'lumot uning roli uchun ochiq emasligini ayt.
- Foydalanuvchi qaysi tilda yozsa, o'sha tilda javob ber (odatda o'zbek tili, lotin).
- Qisqa va aniq: raqamlar, ismlar, keyingi qadam. Rahbarga — boshqaruv tilida, sotuvchiga — o'zini rivojlantirish tilida.
- Ro'yxat bo'lsa, HAR bandni yangi qatordan "• " bilan boshla (bandlarni bitta qatorga yopishtirma).
- Ball 0-100 foizda. Ballsiz (null) mezon "aniqlanmadi" degani, 0 emas.
- Salomlashish yoki umumiy savolga qisqa javob ber va nimalarda yordam bera olishingni ayt.
- Hech qachon ichki ID, texnik maydon nomlari yoki JSON ko'rsatma.`;

/** Foydalanuvchi nomidan ichki API chaqiruvi — ruxsat yo'q bo'lsa null. */
async function oqi(app: FastifyInstance, req: FastifyRequest, url: string): Promise<unknown | 'ruxsat yo\'q' | null> {
  const r = await app.inject({
    method: 'GET',
    url,
    headers: {
      ...(req.headers.cookie ? { cookie: req.headers.cookie } : {}),
      ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}),
    },
  });
  if (r.statusCode === 403) return 'ruxsat yo\'q';
  if (r.statusCode >= 400) return null;
  return r.body ? (r.json() as unknown) : null;
}

const davr = (kun: number) => {
  const to = new Date();
  const from = new Date(to.getTime() - kun * 86_400_000);
  return `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
};

const qisqa = (v: unknown, n: number) => (typeof v === 'string' && v.length > n ? `${v.slice(0, n)}…` : v);
const kun = (v: unknown) => (typeof v === 'string' ? v.slice(0, 10) : v);

/**
 * Bo'limni faqat kerakli maydonlarga qisqartiradi. Xom javoblar ID va
 * texnik maydonlarga to'la (bitta savol ~19k token edi) — model ularni
 * ishlatmaydi, lekin har savolda pulga tushadi (GLM paketi umumiy).
 * Ruxsat yo'q / xato holatini (satr yoki null) o'zgartirmasdan qaytaradi.
 */
function royxat<T>(v: unknown, kalit: string, fn: (x: Record<string, unknown>) => T): T[] | unknown {
  if (!v || typeof v !== 'object' || !(kalit in v)) return v;
  const arr = (v as Record<string, unknown>)[kalit];
  return Array.isArray(arr) ? (arr as Record<string, unknown>[]).map(fn) : v;
}

export function registerAssistantRoutes(app: FastifyInstance): void {
  app.post(
    '/api/v1/businesses/:businessId/assistant/chat',
    {
      preHandler: [requireBusiness],
      // LLM chaqiruvi — pul va vaqt. Bitta foydalanuvchiga daqiqasiga 10 ta savol yetarli.
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const body = chatBody.parse(req.body);
      const b = req.business!;
      const yol = `/api/v1/businesses/${b.businessId}`;
      const hafta = davr(7);

      const [kpi7, kpi30, reyting, mezonlar, ogoh, vazifalar, suhbatlar, seats] = await Promise.all([
        oqi(app, req, `${yol}/dashboard/kpi?${hafta}`),
        oqi(app, req, `${yol}/dashboard/kpi?${davr(30)}`),
        oqi(app, req, `${yol}/dashboard/leaderboard?${hafta}`),
        oqi(app, req, `${yol}/dashboard/criteria?${hafta}`),
        oqi(app, req, `${yol}/alerts?status=active&limit=15`),
        oqi(app, req, `${yol}/tasks?view=overdue&limit=15`),
        oqi(app, req, `${yol}/conversations?status=done&limit=25`),
        oqi(app, req, `${yol}/seats`),
      ]);
      const kpiIxcham = (v: unknown) =>
        v && typeof v === 'object' && 'current' in v
          ? { joriy: (v as Record<string, unknown>).current, oldingi: (v as Record<string, unknown>).previous }
          : v;

      // Suhbatlar ro'yxati — faqat kerakli maydonlar (token tejash, ID'siz).
      const ism = new Map(
        Array.isArray(seats) ? (seats as { id: string; displayName: string }[]).map((s) => [s.id, s.displayName]) : [],
      );
      const songgi =
        suhbatlar && typeof suhbatlar === 'object' && 'conversations' in suhbatlar
          ? (suhbatlar as { conversations: Record<string, unknown>[] }).conversations.map((c) => ({
              sana: kun(c.startedAt),
              menejer: (typeof c.seatId === 'string' && ism.get(c.seatId)) || null,
              ball: c.overallScore,
              turi: c.callFamily,
              lid: c.leadQuality,
              xulosa: qisqa(c.summary, 180),
              zaif_joy: qisqa(c.primaryGap, 160),
            }))
          : suhbatlar;

      const malumot = {
        foydalanuvchi: { ism: req.auth?.user.displayName, rol: b.role, rahbar: b.permissions.includes('analytics:read:all') },
        biznes: b.name,
        bugun: new Date().toISOString().slice(0, 10),
        kpi_7_kun: kpiIxcham(kpi7),
        kpi_30_kun: kpiIxcham(kpi30),
        menejerlar_reytingi_7_kun: royxat(reyting, 'leaderboard', (x) => ({
          ism: x.displayName,
          suhbatlar: x.conversations,
          baholangan: x.analyzed,
          ortacha_ball: x.avgScore,
          eng_yaxshi: x.bestScore,
          belgilangan: x.flagged,
        })),
        mezonlar_7_kun: royxat(mezonlar, 'criteria', (x) => ({
          mezon: `${String(x.code)} ${String(x.name)}`,
          ortacha_foiz: x.avgPct,
          zaif_suhbatlar: x.weakCount,
          baholangan: x.scored,
        })),
        faol_ogohlantirishlar: royxat(ogoh, 'alerts', (x) => ({
          tur: x.kind,
          sarlavha: x.title,
          menejer: x.seatName,
          sana: kun(x.createdAt),
          suhbat: qisqa(x.conversationSummary, 140),
        })),
        kechikkan_vazifalar: royxat(vazifalar, 'tasks', (x) => ({
          vazifa: x.title,
          izoh: qisqa(x.description, 120),
          menejer: (typeof x.seatId === 'string' && ism.get(x.seatId)) || null,
          muddat: kun(x.dueAt),
        })),
        songgi_baholangan_suhbatlar: songgi,
      };

      const tarix = body.tarix
        .slice(-8)
        .map((x) => `${x.rol === 'men' ? 'FOYDALANUVCHI' : 'YORDAMCHI'}: ${x.matn}`)
        .join('\n');

      let llm;
      try {
        llm = await getActiveLlm();
      } catch (err) {
        if (err instanceof LlmSozlanmaganError) {
          throw new AppError(503, 'ai-unavailable', 'AI provayder sozlanmagan — erkin savolga javob berib bo\'lmaydi');
        }
        throw err;
      }

      const r = await llm.completeJson({
        stage: 'stage2',
        maxTokens: 4000,
        reasoningEffort: 'low',
        schema: javobSchema,
        system: SYSTEM,
        user: `MA'LUMOT (JSON):\n${JSON.stringify(malumot)}\n\n${tarix ? `OLDINGI SUHBAT:\n${tarix}\n\n` : ''}SAVOL: ${body.savol}`,
      });
      const j = javobZod.parse(r.json);
      req.log.info({ model: r.model, tokensIn: r.tokensIn, tokensOut: r.tokensOut }, 'ai yordamchi javob berdi');
      return { javob: j.javob.trim(), model: r.model };
    },
  );
}
