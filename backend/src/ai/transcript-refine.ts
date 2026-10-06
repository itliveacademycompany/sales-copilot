import { z } from 'zod';
import { getActiveLlm } from './llm.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TRANSKRIPTNI ANIQLASHTIRISH — qayta bo'lish + rol + imlo tuzatish
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bu modul `role-inference.ts` o'rnini bosadi. Farqi — nafaqat "kim
 * gapirdi" (rol), balki "qayerda YANGI odam gapira boshladi" (segmentatsiya)
 * degan savolga ham javob beradi.
 *
 * ── Nega faqat rol berish yetarli emas ──
 *
 * Amaliyotda ko'rilgan haqiqiy xato: STT (yoki uning VAD segmentatsiyasi)
 * bitta "bo'lak" ichiga IKKI ODAMNING gapini birlashtirib qo'yadi — telefon
 * suhbatida ikkala tomon bir-birini tez-tez bo'lib gapirganda orada
 * yetarlicha uzun jimlik qolmaydi. Natijada bitta blokning yarmi menejer,
 * qolgan yarmi mijoz gapi bo'ladi, lekin unga bitta rol yorlig'i tegib
 * ketadi — va bu xato "MENEJER" ikki marta ketma-ket ko'rinishi orqali
 * darrov bilinadi.
 *
 * Shuning uchun LLM'ga ikkita vazifa birga beriladi: kerak bo'lsa bloklarni
 * QAYTA BO'LISH, va har bir yangi bo'lakka to'g'ri rol berish. Uchinchisi —
 * STT noto'g'ri eshitgan so'zlarni (imlo, tinish belgisi, so'z chegarasi)
 * kontekstga tayanib tiklash, lekin **yangi ma'lumot to'qimasdan**.
 *
 * ── Vaqtni LLM o'zi o'ylab topmaydi ──
 *
 * LLM audioni eshitmagan, faqat matnni ko'radi — shuning uchun aniq
 * soniyani bila olmaydi. Har yangi bo'lak qaysi ASL bo'lakdan (`sourceSeq`)
 * kelganini qaytaradi, vaqtni esa BIZ asl bo'lak oralig'idan hisoblaymiz
 * (bo'linsa — bo'laklar orasida teng taqsimlanadi). Vaqt manbai har doim
 * STT'dan, mazmun va rol — LLM'dan.
 */

export const speakerSchema = z.enum(['manager', 'client']);
export type SpeakerRole = z.infer<typeof speakerSchema>;

export interface RefineInputSegment {
  seq: number;
  text: string;
  startSeconds: number;
  endSeconds: number;
}

export interface RefinedTurn {
  speaker: SpeakerRole;
  text: string;
  startSeconds: number;
  endSeconds: number;
  /** Qaysi asl STT bo'lagidan kelgani — tekshiruv va nosozliklarni tuzatish uchun. */
  sourceSeq: number;
}

export interface RefineResult {
  turns: RefinedTurn[];
  confidence: number;
  note: string;
  /** LLM ishlamadi — heuristik (blokni bo'lmasdan, faqat rol) natija. */
  degraded: boolean;
}

const refineResponseSchema = z.object({
  turns: z.array(
    z.object({
      sourceSeq: z.number().int().min(0),
      speaker: speakerSchema,
      text: z.string().min(1).max(2000),
    }),
  ),
  confidence: z.number().min(0).max(1),
  // JSON schema'da LLM'ga uzunlik chegarasi ko'rsatilmagan (pastga qarang),
  // shuning uchun bu yerda ham qattiq chegara qo'ymaymiz — aks holda LLM
  // to'g'ri javob berса ham, faqat izohi biroz uzunroq bo'lgani uchun
  // BUTUN natija rad etilib, kerakli AI natijasi jimgina heuristikaga
  // almashtirilib qo'yiladi (bu xato haqiqatan yuz berdi va sabab
  // console.error orqali topildi — shuning uchun bu izoh shu yerda).
  note: z.string().max(2000).optional(),
});

const refineJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['turns', 'confidence', 'note'],
  properties: {
    turns: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['sourceSeq', 'speaker', 'text'],
        properties: {
          sourceSeq: { type: 'integer', minimum: 0 },
          speaker: { type: 'string', enum: ['manager', 'client'] },
          text: { type: 'string' },
        },
      },
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    note: { type: 'string' },
  },
} satisfies Record<string, unknown>;

export function formatTime(seconds: number): string {
  const t = Math.max(0, Math.round(seconds));
  const mm = String(Math.floor(t / 60)).padStart(2, '0');
  const ss = String(t % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

const SYSTEM_PROMPT = `Sen o'zbek tilidagi sotuv/xizmat qo'ng'iroqlari transkriptini tozalovchi ekspertsan.

Senga nutqni matnga aylantiruvchi (STT) dastur natijasi — raqamlangan bo'laklar ro'yxati — beriladi. Bu natijada IKKITA muammo bo'lishi mumkin, ikkalasini ham sen tuzatasan.

═══ 1-VAZIFA: KERAK BO'LSA BO'LAKNI QAYTA BO'LISH ═══

STT ko'pincha IKKI ODAMNING gapini bitta bo'lakka birlashtirib qo'yadi — chunki ular orasida uzun jimlik bo'lmagan (bir-birini bo'lib gapirishgan yoki uzluksiz telefon liniyasi). Bunday holatni matn mazmunidan bilib olasan: bitta bo'lak ichida savol va unga javob, yoki ikki xil kayfiyat/mavzu ketma-ket kelsa — bu ikki odam.

Misol (bitta STT bo'lagi, ikki odam aralashgan):
  Kirish [seq=3]: "assalomu alaykum men IT akademiyadan qongiroq qilyapman darslarga kelyapsizmi endi bugun issiq ketolmadim"
  To'g'ri chiqish — IKKITA turn, ikkalasi ham sourceSeq=3:
    {sourceSeq: 3, speaker: "manager", text: "Assalomu alaykum, men IT akademiyadan qo'ng'iroq qilyapman. Darslarga kelyapsizmi?"}
    {sourceSeq: 3, speaker: "client",  text: "Endi bugun issiq, ketolmadim."}

Agar bo'lak bitta odamga tegishli bo'lsa — uni BO'LMA, bitta turn qaytar (sourceSeq o'sha bo'lakning o'zi).

═══ 2-VAZIFA: ROLNI ANIQLASH ═══

MENEJER (sotuv/o'quv markazi xodimi) belgilari:
  - O'zini yoki tashkilot nomini aytadi ("...akademiyadan qo'ng'iroq qilyapman")
  - Rasmiy salomlashadi, hol-ahvol so'raydi
  - Dars/kurs/narx haqida ma'lumot beradi, tushuntiradi
  - Savol beradi: kelyapsizmi, qandoq o'tyapti, yana kerakmi
  - Taklif qiladi, keyingi qadamni aytadi, rahmat aytib yakunlaydi

MIJOZ (yoki uning qarindoshi — ota-ona, aka, opa) belgilari:
  - O'zining yoki yaqinining holatini aytadi (bordim, borolmadim, kasal, band)
  - Savolga JAVOB beradi (ko'proq javob beruvchi tomonda, so'ruvchi emas)
  - Rozi/norozi bo'ladi, sabab tushuntiradi, qisqa tasdiq beradi (ha, yo'q, xo'p)

ENG KUCHLI SIGNAL — FE'L SHAXSI (LEKIN ISTISNOSI BILAN, pastga qara):
  - 1-SHAXS fe'l ("bordim", "qilolmadim", "ko'rdim", "bilmayman") — bu
    GAPIRUVCHINING O'Z HOLATI haqida, odatda MIJOZ (chunki menejer o'zi
    darsga bormaydi, o'zi kasal bo'lmaydi — u tashkilot nomidan
    so'zlaydi, mijozning holati haqida emas).
  - 2-SHAXS savol ("kelyapsizmi", "yaxshimisiz", "boroldingizmi") — odatda
    MENEJER, chunki u mijozning holatini SO'RAYDI.
  - Bitta bo'lak ichida fe'l shaxsi almashsa (masalan "kelyapsizmi" dan
    keyin "bordim" kelsa) — bu ANIQ ikki xil odam, albatta BO'L.

  ⚠️ MUHIM ISTISNO — STT 1/2-SHAXSNI CHALKASHTIRADI:
  Tez yoki noaniq talaffuzda STT "bordingiz" (siz bordingiz, 2-shaxs)
  ni "bordim" (men bordim, 1-shaxs) deb NOTO'G'RI eshitishi juda
  tez-tez uchraydi — "-ingiz" oxiri qisqarib ketadi. Buni matndan
  bilib olish mumkin: agar "1-shaxs" fe'lidan DARHOL KEYIN, bitta
  odamning og'zidan, boshqasiga qaratilgan SAVOL kelsa ("qanday bo'ldi",
  "yoqdimi", "kelyapsizmi") — bu ikkalasi ham menejerniki, chunki bitta
  odam o'z holatini aytib, o'sha zahoti boshqasiga savol bermaydi.
  Bunday holatda BUTUN bo'lakni (statement + savol) MENEJERGA ber, "bordim"
  so'zini "bordingiz" deb tuzat (3-vazifaga qarang).

  Misol:
    Kirish: "besh kun bordim singlim qanday bo'ldi darslar yoqdimi"
    XATO (ko'r-ko'rona 1-shaxs qoidasi): bu client deb belgilash
    TO'G'RI: bu MENEJERNING tekshiruv savoli — "bordim" aslida
      "bordingiz" ("besh kun bordingiz, singlim — qanday bo'ldi,
      darslar yoqdimi?"). Keyingi javob ("menga ma'qul", "yoqdi")
      MIJOZNIKI bo'ladi — aynan shu javob 1-shaxs bo'lgani uchun
      HAQIQIY signal o'sha yerda.

Bo'laklar tartib bilan almashmasligi mumkin (bir odam ketma-ket bir necha bo'lak gapirishi mumkin) — speakerTag yorlig'iga ishonma, FAQAT matn mazmuniga va fe'l shaxsiga qara.

═══ 3-VAZIFA: STT XATOLARINI TUZATISH ═══

STT talaffuzga yaqin, lekin ma'nosiz yoki grammatik xato so'z chiqarishi mumkin (so'zlar qo'shilib/bo'linib ketishi, harflar noto'g'ri eshitilishi). Bunday joyni KONTEKSTGA MOS, TALAFFUZI YAQIN so'z bilan almashtir va kerakli tinish belgilarini (vergul, nuqta, so'roq belgisi) qo'y.

Misollar:
  "yaxshimisizlarcharchamayapsizmi" → "yaxshimisizlar, charchamayapsizmi?"
  "kelolmadimjudaissiq" → "kelolmadim, juda issiq"
  "nimaam ustoz" → "nima ham, ustoz"

QAT'IY QOIDA: faqat ANIQ xato bo'lgan joyni tuzat. Shubhali bo'lsa — asl so'zni SHUNDAY QOLDIR, o'zingdan yangi ma'lumot yoki gap qo'shma. Ismlar, raqamlar, sanalarni o'zgartirma (agar aniq eshitilgan bo'lsa).

═══ CHIQISH QOIDALARI ═══

- Har bir turn qaysi ASL bo'lakdan (sourceSeq) kelganini ko'rsatishi SHART.
- Bitta bo'lak bir nechta turnga bo'linsa, ularni ASL TARTIBDA (gap qanday aytilgan bo'lsa shu tartibda) qaytar.
- Bo'laklar orasidagi umumiy ketma-ketlikni o'zgartirma — faqat ICHKARIDA bo'lish mumkin.
- Har bir asl seq uchun kamida bitta turn bo'lishi SHART — hech birini tashlab ketma.
- Faqat "manager" yoki "client", uchinchi variant yo'q.
- JSON'dan boshqa hech narsa yozma.

═══ CONFIDENCE — HAQIQIY BAHO BER ═══

"confidence" — o'zingning ishonching, foydalanuvchini tinchlantirish uchun
emas. Suhbat matni tez-tez bir-birini bo'lib gapiradigan, "ha-ha", "xo'p",
"bo'ldi" kabi tasdiqlovchi so'zlar bilan to'la bo'lsa, yoki rolni ikkilanib
belgilagan joylar bo'lsa — confidence PAST bo'lsin (0.5-0.7). Faqat matn
aniq, rollar ochiq-oydin ko'rinsa — 0.85+ ber. Past confidence foydalanuvchini
"buni diqqat bilan tekshiring" deb ogohlantiradi, shuning uchun uni sun'iy
oshirmang.`;

/**
 * Bo'lak ichida rol/kontekst ko'rinmasa ishlatiladigan zaxira: hech narsani
 * bo'lmasdan, oddiy kalit so'zlar bo'yicha rol beradi. LLM butunlay
 * ishlamay qolganda ham foydalanuvchi bo'sh qo'l bilan qolmasin uchun.
 */
function refineHeuristically(segments: RefineInputSegment[]): RefineResult {
  const managerHints = [
    'tushundim', 'yaxshimisiz', 'kelyapsizmi', 'yozib', 'kelavering',
    'qo\'shimcha kelib', 'darslaringiz', 'o\'rganib olsangiz', 'xursandmiz',
    'sizga', 'qanday yordam', 'narxi', 'kurs', 'guruh', 'ustoz', 'akademiya',
  ];
  const clientHints = [
    'bordim', 'borolmadim', 'yoqmadi', 'qimmat', 'o\'ylab ko\'raman',
    'kamchilik', 'singlim', 'farzandim', 'bolam', 'akam', 'opam',
  ];

  return {
    degraded: true,
    confidence: 0.4,
    note: 'AI ishlamadi — oddiy kalit-so\'z qoidalari bilan taxminiy ajratildi. Diqqat bilan tekshiring.',
    turns: segments.map((s) => {
      const text = s.text.toLowerCase();
      const managerScore = managerHints.filter((h) => text.includes(h)).length;
      const clientScore = clientHints.filter((h) => text.includes(h)).length;
      return {
        speaker: managerScore >= clientScore ? 'manager' : 'client',
        text: s.text,
        startSeconds: s.startSeconds,
        endSeconds: s.endSeconds,
        sourceSeq: s.seq,
      };
    }),
  };
}

/**
 * Bitta asl bo'lak N ta turnga bo'lingan bo'lsa, ularga oraliqni teng
 * bo'lib beradi. Aniq emas (LLM audioni eshitmaydi), lekin ketma-ketlik
 * va umumiy davomiylik to'g'ri qoladi — bu esa javob tezligi kabi
 * metrikalar uchun yetarli.
 */
export function assignTimes(
  turns: { sourceSeq: number; speaker: SpeakerRole; text: string }[],
  bySeq: Map<number, RefineInputSegment>,
): RefinedTurn[] {
  const groups = new Map<number, number>();
  for (const t of turns) groups.set(t.sourceSeq, (groups.get(t.sourceSeq) ?? 0) + 1);

  const seenCount = new Map<number, number>();
  return turns.map((t) => {
    const src = bySeq.get(t.sourceSeq);
    if (!src) {
      // LLM mavjud bo'lmagan seq qaytarsa — nol vaqt bilan davom etamiz,
      // butun natijani rad etishdan ko'ra shu xavfsizroq.
      return { ...t, startSeconds: 0, endSeconds: 0 };
    }
    const total = groups.get(t.sourceSeq) ?? 1;
    const idx = seenCount.get(t.sourceSeq) ?? 0;
    seenCount.set(t.sourceSeq, idx + 1);

    const span = Math.max(0, src.endSeconds - src.startSeconds);
    const start = src.startSeconds + (span * idx) / total;
    const end = src.startSeconds + (span * (idx + 1)) / total;
    return { ...t, startSeconds: start, endSeconds: end };
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Vaqtinchalik xatoda (429 rate-limit, 5xx, tarmoq uzilishi) qayta urinadi.
 *
 * Bepul/umumiy modellarda 429 tez-tez uchraydi va odatda bir necha
 * soniyada o'zi tuzaladi. Buni birinchi urinishdayoq heuristikaga
 * tushirish — ishlaydigan narsani "AI ishlamadi" deb ko'rsatish bilan
 * barobar. Foydalanuvchi audio yuklab, natija kutib turibdi — 2-3
 * soniyalik qo'shimcha kutish narxi past, foydasi katta.
 *
 * 400/401/403 kabi doimiy xatolarda qayta urinish foydasiz — ular
 * darrov heuristikaga tushadi.
 */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const message = err instanceof Error ? err.message : String(err);
      const doimiyXato = /\((400|401|403|404)\b/.test(message);
      if (doimiyXato || i === attempts - 1) throw err;
      await sleep(1500 * (i + 1));
    }
  }
  throw lastErr;
}

export async function refineTranscript(
  segments: RefineInputSegment[],
): Promise<RefineResult> {
  if (segments.length === 0) {
    return { turns: [], confidence: 0, note: 'Transkript bo\'sh.', degraded: false };
  }

  // Juda uzun suhbatda token va JSON hajmi cheksiz o'smasligi uchun.
  // 70 bo'lak ~10-15 daqiqalik qo'ng'iroqqa yetadi.
  const limited = segments.slice(0, 70);

  try {
    const transcript = limited
      .map((s) => `[${s.seq}] [${formatTime(s.startSeconds)}-${formatTime(s.endSeconds)}] ${s.text}`)
      .join('\n');

    const res = await withRetry(async () => {
      const llm = await getActiveLlm();
      return llm.completeJson({
        stage: 'stage2',
        maxTokens: 6000,
        schema: refineJsonSchema,
        system: SYSTEM_PROMPT,
        user: `Quyidagi STT bo'laklarini tozala, kerak bo'lsa bo'l, rol ber:\n\n${transcript}`,
      });
    });

    const parsed = refineResponseSchema.parse(res.json);
    const bySeq = new Map(limited.map((s) => [s.seq, s]));

    // LLM tashlab ketgan seq bo'lsa — asl matnni o'zgartirmasdan qo'shamiz,
    // shunda suhbatning bir qismi jimgina yo'qolib qolmaydi.
    const coveredSeqs = new Set(parsed.turns.map((t) => t.sourceSeq));
    const missing = limited.filter((s) => !coveredSeqs.has(s.seq));

    const allTurnsRaw = [
      ...parsed.turns,
      ...missing.map((s) => ({ sourceSeq: s.seq, speaker: 'client' as SpeakerRole, text: s.text })),
    ].sort((a, b) => {
      const orderA = bySeq.get(a.sourceSeq) ? limited.indexOf(bySeq.get(a.sourceSeq)!) : 0;
      const orderB = bySeq.get(b.sourceSeq) ? limited.indexOf(bySeq.get(b.sourceSeq)!) : 0;
      return orderA - orderB;
    });

    return {
      confidence: parsed.confidence,
      note:
        (parsed.note ?? `AI transkriptni tozaladi va rollarni ajratdi (${res.model}).`) +
        (missing.length > 0 ? ` ${missing.length} ta bo'lak AI javobida yo'q edi — asl holida qo'shildi.` : ''),
      degraded: false,
      turns: assignTimes(allTurnsRaw, bySeq),
    };
  } catch (err) {
    console.error('[transcript-refine] LLM ishlamadi, heuristikaga qaytildi:', err);
    return refineHeuristically(limited);
  }
}
