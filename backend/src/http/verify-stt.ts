import { extractWords, wordsToUtterances, type SttWord } from '../ai/stt.js';
import { utterancesToTranscript } from '../import/transcript-parser.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * STT MANTIG'I TESTI — FAZA 2
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ishga tushirish: npm run verify:stt
 *
 * Haqiqiy Google API chaqirilmaydi — tarmoqqa bog'liq test ishonchsiz
 * bo'lardi va pul sarflardi. Buning o'rniga **javobni qayta ishlash**
 * mantig'i sinaladi: aynan shu joyda jimgina buziladigan xatolar
 * bo'ladi (transkript qirqilishi, so'zlovchilar chalkashishi).
 */

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function w(text: string, speakerTag: number, start: number, end: number): SttWord {
  return { text, speakerTag, startSeconds: start, endSeconds: end };
}

function main(): void {
  console.log('\nSTT javobini qayta ishlash\n');

  // ═══ SO'ZLARNI GAPGA YIG'ISH ═══
  console.log('— gaplarga yig\'ish —');

  const oddiy = wordsToUtterances([
    w('Salom', 1, 0, 0.5),
    w('narxi', 1, 0.6, 1.0),
    w('qancha', 1, 1.1, 1.6),
    w('Assalomu', 2, 2.0, 2.5),
    w('alaykum', 2, 2.6, 3.2),
  ]);
  check('ketma-ket bir xil so\'zlovchi bitta gapga yig\'iladi', oddiy.length === 2);
  check('matn to\'g\'ri birlashdi', oddiy[0]?.text === 'Salom narxi qancha', oddiy[0]?.text);
  check('boshlanish vaqti birinchi so\'zdan', oddiy[0]?.startSeconds === 0);
  check('tugash vaqti oxirgi so\'zdan', oddiy[0]?.endSeconds === 1.6, String(oddiy[0]?.endSeconds));

  const almashuv = wordsToUtterances([
    w('a', 1, 0, 1),
    w('b', 2, 1, 2),
    w('c', 1, 2, 3),
    w('d', 2, 3, 4),
  ]);
  check('har almashuvda yangi gap', almashuv.length === 4);

  check('bo\'sh ro\'yxat — bo\'sh natija', wordsToUtterances([]).length === 0);

  // ═══ GOOGLE JAVOBIDAN SO'ZLARNI AJRATISH ═══
  console.log('\n— Google javobi —');

  /**
   * Diarizatsiya yoqilganda Google so'zlarni OXIRGI `result` ichida
   * to'liq qaytaradi, oldingilarida qisman. Eng ko'p so'zlisini
   * olmasak — transkript qirqilib qoladi. Bu jim buziladigan xato.
   */
  const kopNatija = extractWords([
    { alternatives: [{ words: [{ word: 'birinchi', startTime: '0s', endTime: '1s', speakerTag: 1 }] }] },
    {
      alternatives: [
        {
          words: [
            { word: 'birinchi', startTime: '0s', endTime: '1s', speakerTag: 1 },
            { word: 'ikkinchi', startTime: '1s', endTime: '2s', speakerTag: 1 },
            { word: 'uchinchi', startTime: '2s', endTime: '3s', speakerTag: 2 },
          ],
        },
      ],
    },
  ]);
  check('eng to\'liq natija tanlanadi (qirqilmaydi)', kopNatija.length === 3, `${kopNatija.length}`);

  const vaqt = extractWords([
    { alternatives: [{ words: [{ word: 'x', startTime: '12.500s', endTime: '13.250s', speakerTag: 2 }] }] },
  ]);
  check('vaqt "12.500s" formatidan o\'qiladi', vaqt[0]?.startSeconds === 12.5, String(vaqt[0]?.startSeconds));
  check('tugash vaqti ham', vaqt[0]?.endSeconds === 13.25);

  const belgisiz = extractWords([
    { alternatives: [{ words: [{ word: 'a', startTime: '0s', endTime: '1s' }] }] },
  ]);
  check('belgisiz so\'z 1-so\'zlovchiga beriladi', belgisiz[0]?.speakerTag === 1);

  const bosh = extractWords([{ alternatives: [{ words: [{ word: '', startTime: '0s' }] }] }]);
  check('bo\'sh so\'z tashlab ketiladi', bosh.length === 0);

  check('natijasiz javob — bo\'sh', extractWords([]).length === 0);
  check('alternatives yo\'q — yiqilmaydi', extractWords([{}]).length === 0);

  // ═══ SO'ZLOVCHI → ROL ═══
  console.log('\n— so\'zlovchini rolga bog\'lash —');

  const utterances = [
    { speakerTag: 1, text: 'Salom, narxi qancha?', startSeconds: 0, endSeconds: 2, confidence: null },
    { speakerTag: 2, text: 'Assalomu alaykum! Qaysi yo\'nalish?', startSeconds: 2, endSeconds: 5, confidence: null },
    { speakerTag: 1, text: 'Frontend', startSeconds: 5, endSeconds: 6, confidence: null },
  ];

  // Qator shakli: `[MM:SS] Rol: matn` — rol vaqt belgisidan keyin keladi.
  const rol = (line: string | undefined): string | null =>
    /^\[\d{2}:\d{2}\]\s*(\w+):/.exec(line ?? '')?.[1] ?? null;

  const matn = utterancesToTranscript(utterances, 2);
  check(
    '2-so\'zlovchi menejer deb belgilanganda',
    rol(matn.split('\n')[0]) === 'Mijoz' && rol(matn.split('\n')[1]) === 'Menejer',
    matn.split('\n').slice(0, 2).join(' | '),
  );

  const teskari = utterancesToTranscript(utterances, 1);
  check(
    '1-so\'zlovchi menejer deb belgilanganda — teskari',
    rol(teskari.split('\n')[0]) === 'Menejer' && rol(teskari.split('\n')[1]) === 'Mijoz',
    teskari.split('\n')[0],
  );

  check('matnda vaqt belgisi bor', /\[\d{2}:\d{2}\]/.test(matn), matn.split('\n')[0]);
  check(
    'matn transkript parseri tushunadigan shaklda',
    matn.includes('Mijoz:') && matn.includes('Menejer:'),
  );

  console.log(
    `\n${fail === 0 ? 'STT mantig\'i butun.' : 'XATOLAR BOR.'} ${pass}/${pass + fail} tekshiruv o'tdi.`,
  );
  if (fail > 0) process.exit(1);
}

main();
