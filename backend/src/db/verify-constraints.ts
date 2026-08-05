import 'dotenv/config';
import postgres from 'postgres';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ISBOTLI BAHOLASH CHEKLOVLARI TESTI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ishga tushirish: npm run db:verify-constraints
 *
 * `criterion_score` jadvalidagi CHECK cheklovlari mahsulotning asosiy
 * va'dasini kafolatlaydi: **isbotsiz ball yo'q**.
 *
 * Bu shunchaki kelishuv emas — baza darajasida majburlanadi. Kimdir
 * kelajakda ilova kodida xato qilsa yoki qisqa yo'l izlasa, baza rad etadi.
 *
 * Test egalik ulanishidan foydalanadi, chunki u RLS emas, CHECK
 * cheklovlarini tekshiradi.
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

async function main(): Promise<void> {
  const adminUrl = process.env.DATABASE_URL_ADMIN;
  if (!adminUrl) throw new Error('DATABASE_URL_ADMIN sozlanmagan');

  const sql = postgres(adminUrl, { max: 1 });
  const tag = Date.now().toString(36);

  console.log('\nIsbotli baholash cheklovlari\n');

  try {
    const [biz] = await sql<{ id: string }[]>`
      INSERT INTO business (slug, name)
      VALUES (${`ev-${tag}`}, 'Constraint test') RETURNING id`;
    const [conv] = await sql<{ id: string }[]>`
      INSERT INTO conversation (business_id, channel, direction, started_at)
      VALUES (${biz!.id}, 'phone', 'outbound', now()) RETURNING id`;
    const [an] = await sql<{ id: string }[]>`
      INSERT INTO analysis (conversation_id, business_id)
      VALUES (${conv!.id}, ${biz!.id}) RETURNING id`;

    const insert = (code: string, score: number | null, quote: string | null) => sql`
      INSERT INTO criterion_score
        (analysis_id, conversation_id, business_id, criterion_code,
         criterion_name, rubric_snapshot, score, evidence_quote)
      VALUES (${an!.id}, ${conv!.id}, ${biz!.id}, ${code}, 'Test mezoni',
              ${sql.json({ '0': 'yo\'q', '3': 'to\'liq' })}, ${score}, ${quote})`;

    const attempt = async (
      code: string,
      score: number | null,
      quote: string | null,
    ): Promise<boolean> => {
      try {
        await insert(code, score, quote);
        return true;
      } catch {
        return false;
      }
    };

    check('isbotsiz ball RAD ETILDI', !(await attempt('A1', 2, null)));
    check('isbotli ball qabul qilindi', await attempt('A2', 2, '07:12 — men shunday dedim'));
    check('"aniqlanmadi" (score = NULL) qabul qilindi', await attempt('A3', null, null));
    check('diapazondan tashqari ball (5) RAD ETILDI', !(await attempt('A4', 5, 'iqtibos')));
    check('manfiy ball (-1) RAD ETILDI', !(await attempt('A5', -1, 'iqtibos')));

    await sql`DELETE FROM business WHERE id = ${biz!.id}`;
  } finally {
    await sql.end({ timeout: 5 });
  }

  console.log(
    fail === 0
      ? `\nCheklovlar ishlaydi. ${pass}/${pass} tekshiruv o'tdi.\n`
      : `\n${fail} ta tekshiruv MUVAFFAQIYATSIZ.\n`,
  );
  process.exitCode = fail === 0 ? 0 : 1;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
