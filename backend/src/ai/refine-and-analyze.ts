import { z } from 'zod';
import type { Criteria, PlaybookBody } from '../playbook/schema.js';
import { getActiveLlm, type LlmClient } from './llm.js';
import {
  stage2Result,
  stage2Schema,
  stage3Result,
  stage3Schema,
  type Stage2Result,
  type Stage3Result,
} from './prompts.js';
import {
  assignTimes,
  formatTime,
  speakerSchema,
  withRetry,
  type RefineInputSegment,
  type RefinedTurn,
} from './transcript-refine.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BIRLASHTIRILGAN OQIM — transkript + klassifikatsiya + baholash BITTA so'rovda
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `transcript-refine.ts` (rol+bo'lish+imlo) va `analyze.ts` (stage2
 * ekstraksiya + stage3 isbotli baholash) — uch alohida LLM chaqiruvi
 * o'rniga BITTA so'rovga birlashtirilgan varianti. Sabab: audio yuklashda
 * tezlik va narx (3 chaqiruv o'rniga 1 ta).
 *
 * ⚠️ MUHIM FARQ — FR-84 xavfsizligi zaiflaydi: odatiy oqimda inson
 * transkriptni TASDIQLAGANDAN keyingina baholash ishga tushadi (rol
 * xato bo'lsa, buni saqlashdan oldin ko'radi). Bu yerda ikkalasi bir
 * vaqtda chiqadi — agar AI spikerni xato aniqlasa, ball ham xato
 * chiqishi mumkin va buni ko'rish uchun alohida bosqich yo'q. Bu
 * ONGLI tanlov (foydalanuvchi so'ragan), lekin FR-80/82 (isbotsiz ball
 * yo'q) darvozasi baribir to'liq ishlaydi: `evidenceSegment` endi
 * "sourceSeq" emas, balki shu javobning O'ZI hosil qilgan `turns`
 * massividagi INDEKS'ga ishora qiladi — shuning uchun iqtibos
 * tekshiruvi (`verifyEvidence` — analyze.ts) yakuniy transkript matniga
 * qarshi ishlay oladi, xuddi oldingi ikki bosqichli oqimdagidek.
 */

export interface RefineAndAnalyzeResult {
  turns: RefinedTurn[];
  transcriptConfidence: number;
  transcriptNote: string;
  extracted: Stage2Result;
  stage3: Stage3Result;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  model: string;
}

const mergedResponseSchema = z.object({
  turns: z.array(
    z.object({
      sourceSeq: z.number().int().min(0),
      speaker: speakerSchema,
      text: z.string().min(1).max(2000),
    }),
  ),
  transcriptConfidence: z.number().min(0).max(1),
  // JSON sxemada uzunlik chegarasi yo'q — sabab transcript-refine.ts dagi
  // xuddi shu izohda: qattiq zod chegarasi to'g'ri javobni ham rad etib,
  // butun natijani jimgina yo'qotishi mumkin.
  transcriptNote: z.string().max(2000).optional(),
  classification: stage2Result,
  scoring: stage3Result,
});

const mergedJsonSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['turns', 'transcriptConfidence', 'transcriptNote', 'classification', 'scoring'],
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
    transcriptConfidence: { type: 'number', minimum: 0, maximum: 1 },
    transcriptNote: { type: 'string' },
    classification: stage2Schema,
    scoring: stage3Schema,
  },
};

function formatCriterionAll(c: PlaybookBody['criteria']['criteria'][number]): string {
  return [
    `${c.code}. ${c.name} — ${c.description}`,
    `   0: ${c.rubric['0']}`,
    `   1: ${c.rubric['1']}`,
    `   2: ${c.rubric['2']}`,
    `   3: ${c.rubric['3']}`,
  ].join('\n');
}

/**
 * Stage3'dan farqli o'laroq — bu yerda callFamily hali NOMA'LUM (u ham
 * shu javobning bir qismi), shuning uchun applicable subsetni oldindan
 * hisoblab bo'lmaydi. Modelga BARCHA faol mezonlar (qaysi callFamily'ga
 * tegishli ekani ko'rsatib) beriladi; kodda esa `analyze.ts`dagi
 * `applicableCriteria` javobdagi callFamily asosida YANA bir marta
 * filtrlanadi — mos kelmagan kod hech qachon yozilmaydi (xuddi eski
 * oqimda "model bilmagan kod qaytarsa e'tiborsiz" qoidasi kabi).
 */
function formatAllCriteria(criteria: Criteria): string {
  return criteria.categories
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((cat) => {
      const crits = criteria.criteria.filter((c) => c.isActive && c.categoryCode === cat.code);
      if (crits.length === 0) return null;
      return `KATEGORIYA ${cat.code}: ${cat.name} (vazn ${cat.weightPct}%)\n${crits
        .map((c) => {
          const scope =
            c.appliesTo.callFamilies.length > 0
              ? ` [FAQAT: ${c.appliesTo.callFamilies.join(', ')}]`
              : '';
          return formatCriterionAll(c) + scope;
        })
        .join('\n')}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

function buildSystemPrompt(body: PlaybookBody, businessContext: string): string {
  const policy = body.classificationPolicy;

  return `Sen o'zbek tilidagi sotuv/xizmat qo'ng'iroqlarini TRANSKRIPT QILUVCHI VA BAHOLOVCHI ekspertsan. Bitta javobda UCHTA vazifani ketma-ket bajarasan: (A) transkriptni tozalash, (B) suhbatni klassifikatsiya qilish, (C) isbotli baholash.

═══════════════════════════════════════════════════════════════
VAZIFA A — TRANSKRIPTNI TOZALASH ("turns" maydoni)
═══════════════════════════════════════════════════════════════

Senga nutqni matnga aylantiruvchi (STT) dastur natijasi — raqamlangan bo'laklar ro'yxati — beriladi. Bu natijada IKKITA muammo bo'lishi mumkin, ikkalasini ham sen tuzatasan.

── A1: KERAK BO'LSA BO'LAKNI QAYTA BO'LISH ──

STT ko'pincha IKKI ODAMNING gapini bitta bo'lakka birlashtirib qo'yadi — chunki ular orasida uzun jimlik bo'lmagan (bir-birini bo'lib gapirishgan yoki uzluksiz telefon liniyasi). Bunday holatni matn mazmunidan bilib olasan: bitta bo'lak ichida savol va unga javob, yoki ikki xil kayfiyat/mavzu ketma-ket kelsa — bu ikki odam.

Misol (bitta STT bo'lagi, ikki odam aralashgan):
  Kirish [seq=3]: "assalomu alaykum men IT akademiyadan qongiroq qilyapman darslarga kelyapsizmi endi bugun issiq ketolmadim"
  To'g'ri chiqish — IKKITA turn, ikkalasi ham sourceSeq=3:
    {sourceSeq: 3, speaker: "manager", text: "Assalomu alaykum, men IT akademiyadan qo'ng'iroq qilyapman. Darslarga kelyapsizmi?"}
    {sourceSeq: 3, speaker: "client",  text: "Endi bugun issiq, ketolmadim."}

Agar bo'lak bitta odamga tegishli bo'lsa — uni BO'LMA, bitta turn qaytar (sourceSeq o'sha bo'lakning o'zi).

── A2: ROLNI ANIQLASH ──

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
  so'zini "bordingiz" deb tuzat (A3-vazifaga qarang).

  Misol:
    Kirish: "besh kun bordim singlim qanday bo'ldi darslar yoqdimi"
    XATO (ko'r-ko'rona 1-shaxs qoidasi): bu client deb belgilash
    TO'G'RI: bu MENEJERNING tekshiruv savoli — "bordim" aslida
      "bordingiz" ("besh kun bordingiz, singlim — qanday bo'ldi,
      darslar yoqdimi?"). Keyingi javob ("menga ma'qul", "yoqdi")
      MIJOZNIKI bo'ladi — aynan shu javob 1-shaxs bo'lgani uchun
      HAQIQIY signal o'sha yerda.

Bo'laklar tartib bilan almashmasligi mumkin (bir odam ketma-ket bir necha bo'lak gapirishi mumkin) — speakerTag yorlig'iga ishonma, FAQAT matn mazmuniga va fe'l shaxsiga qara.

── A3: STT XATOLARINI TUZATISH ──

STT talaffuzga yaqin, lekin ma'nosiz yoki grammatik xato so'z chiqarishi mumkin (so'zlar qo'shilib/bo'linib ketishi, harflar noto'g'ri eshitilishi). Bunday joyni KONTEKSTGA MOS, TALAFFUZI YAQIN so'z bilan almashtir va kerakli tinish belgilarini (vergul, nuqta, so'roq belgisi) qo'y.

Misollar:
  "yaxshimisizlarcharchamayapsizmi" → "yaxshimisizlar, charchamayapsizmi?"
  "kelolmadimjudaissiq" → "kelolmadim, juda issiq"
  "nimaam ustoz" → "nima ham, ustoz"

QAT'IY QOIDA: faqat ANIQ xato bo'lgan joyni tuzat. Shubhali bo'lsa — asl so'zni SHUNDAY QOLDIR, o'zingdan yangi ma'lumot yoki gap qo'shma. Ismlar, raqamlar, sanalarni o'zgartirma (agar aniq eshitilgan bo'lsa).

── A — CHIQISH QOIDALARI ──

- Har bir turn qaysi ASL bo'lakdan (sourceSeq) kelganini ko'rsatishi SHART.
- Bitta bo'lak bir nechta turnga bo'linsa, ularni ASL TARTIBDA qaytar.
- Bo'laklar orasidagi umumiy ketma-ketlikni o'zgartirma — faqat ICHKARIDA bo'lish mumkin.
- Har bir asl seq uchun kamida bitta turn bo'lishi SHART.
- Faqat "manager" yoki "client", uchinchi variant yo'q.
- "transcriptConfidence" — haqiqiy baho ber (tez-tez bo'lib gapirilgan, tasdiqlovchi so'zlarga to'la suhbatda past, 0.5-0.7; aniq suhbatda 0.85+). Foydalanuvchini tinchlantirish uchun sun'iy oshirma.

═══════════════════════════════════════════════════════════════
VAZIFA B — KLASSIFIKATSIYA VA EKSTRAKSIYA ("classification" maydoni)
═══════════════════════════════════════════════════════════════

VAZIFA A da hosil qilgan "turns" ustida ishla (xuddi shu matn — boshqa hech narsa o'ylab topma).

QOIDALAR:
- Faqat suhbatda AYTILGAN faktlarni yoz. Taxmin qilma.
- Suhbat qaysi tilda bo'lsa, matn maydonlarini o'sha tilda yoz.
- Ishonching past bo'lsa (suhbat qisqa, noaniq) — confidence ni past qo'y.
- callFamily ni faqat berilgan ro'yxatdan tanla; mos kelmasa null.

BIZNES KONTEKSTI:
${businessContext || '(berilmagan)'}

QO'NG'IROQ OILALARI (kalit — tavsif):
${policy.callFamilies.map((f) => `${f.key} — ${f.name}: ${f.description}`).join('\n') || '(berilmagan)'}

XIZMAT YO'NALISHLARI:
${policy.serviceLines.join(', ') || '(berilmagan)'}

ANKETA SAVOLLARI (id — savol):
${body.questionnaire.questions.map((q) => `${q.id} — ${q.question}`).join('\n') || '(anketa savollari yo\'q)'}

QOSHIMCHA KO'RSATMALAR:
${body.promptNotes.stage2.extractionHints || '(yo\'q)'}

═══════════════════════════════════════════════════════════════
VAZIFA C — ISBOTLI BAHOLASH ("scoring" maydoni)
═══════════════════════════════════════════════════════════════

ENG MUHIM QOIDA — ISBOT:
- Ball qo'ysang, VAZIFA A da hosil qilgan "turns" massividan SO'ZMA-SO'Z iqtibos keltirishing SHART (evidenceQuote).
- "evidenceSegment" maydoniga — bu safar oldindan berilgan segment YO'Q, shuning uchun O'ZING hosil qilgan "turns" massividagi INDEKSNI (0 dan boshlab, qaysi turn'dan iqtibos olinganini) yoz.
- Iqtibos keltira olmasang — score ni null qo'y ("aniqlanmadi"). Bu xato emas, halollik.

BAHOLASH:
- Har mezon uchun rubrikadagi 0/1/2/3 tavsiflaridan eng mosini tanla.
- Har mezon oldida [FAQAT: ...] belgisi bo'lsa — bu mezon FAQAT o'sha callFamily'larga tegishli. Agar VAZIFA B da aniqlagan callFamily bu ro'yxatda bo'lmasa — bu mezonga score:null qo'y (baholama).
- [FAQAT: ...] belgisi yo'q mezonlar — barcha suhbat turlariga tegishli, doim baholanadi.
- Mezon boshqa sabab bilan ham (masalan mavzu umuman ko'tarilmagan) suhbatga taalluqli bo'lmasa — score null.
- redFlags faqat berilgan ro'yxatdagi kalitlardan; har biriga isbot iqtibosi shart.
- Kouching maslahatlarini menejerga qaratib, suhbat tilida yoz.

MEZONLAR (BARCHASI — faqat callFamily'ga mos kelganlarini baholaysan):
${formatAllCriteria(body.criteria)}

QIZIL BAYROQLAR (kalit — tavsif):
${body.classificationPolicy.redFlags.map((f) => `${f.key} — ${f.description} (${f.severity})`).join('\n') || '(yo\'q)'}

QOSHIMCHA KO'RSATMALAR:
${body.promptNotes.stage3.scoringGuidance || '(yo\'q)'}

═══════════════════════════════════════════════════════════════
CHIQISH FORMATI
═══════════════════════════════════════════════════════════════

Faqat JSON qaytar: { turns, transcriptConfidence, transcriptNote, classification, scoring }. Boshqa hech narsa yozma.`;
}

export async function refineAndAnalyzeTranscript(
  segments: RefineInputSegment[],
  body: PlaybookBody,
  businessContext: string,
  startedAt?: Date,
  /** Testda soxta mijoz berish uchun; ishlab chiqarishda faol provayder. */
  llmClient?: LlmClient,
): Promise<RefineAndAnalyzeResult> {
  if (segments.length === 0) {
    throw new Error('Transkript bo\'sh — baholab bo\'lmaydi.');
  }

  // Juda uzun suhbatda token va JSON hajmi cheksiz o'smasligi uchun
  // (transcript-refine.ts bilan bir xil chegara).
  const limited = segments.slice(0, 70);

  const transcript = limited
    .map((s) => `[${s.seq}] [${formatTime(s.startSeconds)}-${formatTime(s.endSeconds)}] ${s.text}`)
    .join('\n');

  const dateLine = startedAt ? `SUHBAT SANASI: ${startedAt.toISOString()}\n` : '';
  const system = buildSystemPrompt(body, businessContext);

  const res = await withRetry(async () => {
    const llm = llmClient ?? (await getActiveLlm());
    return llm.completeJson({
      stage: 'stage2',
      maxTokens: 16000,
      schema: mergedJsonSchema,
      system,
      user: `${dateLine}Quyidagi STT bo'laklarini tozala, klassifikatsiya qil va bahola:\n\n${transcript}`,
    });
  });

  const parsed = mergedResponseSchema.parse(res.json);
  const bySeq = new Map(limited.map((s) => [s.seq, s]));

  // LLM tashlab ketgan seq bo'lsa — asl matnni o'zgartirmasdan qo'shamiz,
  // shunda suhbatning bir qismi jimgina yo'qolib qolmaydi (transcript-refine
  // bilan bir xil himoya).
  const coveredSeqs = new Set(parsed.turns.map((t) => t.sourceSeq));
  const missing = limited.filter((s) => !coveredSeqs.has(s.seq));

  const allTurnsRaw = [
    ...parsed.turns,
    ...missing.map((s) => ({ sourceSeq: s.seq, speaker: 'client' as const, text: s.text })),
  ].sort((a, b) => {
    const orderA = bySeq.get(a.sourceSeq) ? limited.indexOf(bySeq.get(a.sourceSeq)!) : 0;
    const orderB = bySeq.get(b.sourceSeq) ? limited.indexOf(bySeq.get(b.sourceSeq)!) : 0;
    return orderA - orderB;
  });

  return {
    turns: assignTimes(allTurnsRaw, bySeq),
    transcriptConfidence: parsed.transcriptConfidence,
    transcriptNote:
      (parsed.transcriptNote ?? `AI transkriptni tozaladi va baholadi (${res.model}).`) +
      (missing.length > 0
        ? ` ${missing.length} ta bo'lak AI javobida yo'q edi — asl holida qo'shildi.`
        : ''),
    extracted: parsed.classification,
    stage3: parsed.scoring,
    costUsd: res.costUsd,
    tokensIn: res.tokensIn,
    tokensOut: res.tokensOut,
    model: res.model,
  };
}
