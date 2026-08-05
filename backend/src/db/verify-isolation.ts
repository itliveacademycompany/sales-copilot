import { sql } from 'drizzle-orm';
import { closeDb, db, withTenant, withoutTenantIsolation } from './index.js';
import { business, conversation } from './schema/index.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TENANT IZOLYATSIYASI TESTI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ishga tushirish:  npx tsx src/db/verify-isolation.ts
 *
 * Bu test RLS "yoqilgan" deb ishonishdan farq qiladi — u ikkita haqiqiy
 * biznes yaratadi, har biriga ma'lumot yozadi va **birining kontekstidan
 * ikkinchisining ma'lumotini o'qishga urinadi**.
 *
 * Nega bu kerak: `ENABLE ROW LEVEL SECURITY` yozib `FORCE` ni unutish —
 * himoya yoqilgandek ko'rinadi, lekin jadval egasi (ya'ni bizning ilova)
 * uchun umuman ishlamaydi. Bunday xatoni faqat shunday test tutadi.
 *
 * Har deploydan oldin ishga tushiriladi.
 */

let failures = 0;

function check(name: string, passed: boolean, detail = ''): void {
  if (passed) {
    console.log(`  PASS  ${name}`);
  } else {
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
    failures++;
  }
}

async function main(): Promise<void> {
  const suffix = Date.now().toString(36);
  const slugA = `t-iso-a-${suffix}`;
  const slugB = `t-iso-b-${suffix}`;

  console.log('\nTenant izolyatsiyasi testi\n');

  // ── Tayyorgarlik: ikkita biznes (RLS ni chetlab o'tib) ──
  const { idA, idB } = await withoutTenantIsolation(
    'test tayyorgarligi: ikkita izolyatsiya qilinadigan tenant yaratish',
    async (tx) => {
      const [a] = await tx
        .insert(business)
        .values({ slug: slugA, name: 'Tenant A' })
        .returning({ id: business.id });
      const [b] = await tx
        .insert(business)
        .values({ slug: slugB, name: 'Tenant B' })
        .returning({ id: business.id });
      if (!a || !b) throw new Error('biznes yaratilmadi');

      await tx.insert(conversation).values([
        {
          businessId: a.id,
          channel: 'phone',
          direction: 'outbound',
          externalId: `a-${suffix}`,
          startedAt: new Date(),
        },
        {
          businessId: b.id,
          channel: 'phone',
          direction: 'outbound',
          externalId: `b-${suffix}`,
          startedAt: new Date(),
        },
      ]);
      return { idA: a.id, idB: b.id };
    },
  );

  try {
    // ── 1. O'z ma'lumotini ko'radi ──
    const own = await withTenant(idA, (tx) => tx.select().from(conversation));
    check('A o\'z suhbatini ko\'radi', own.length === 1, `topildi: ${own.length}`);

    // ── 2. Begona ma'lumotni KO'RMAYDI ──
    const foreign = own.filter((c) => c.businessId !== idA);
    check('A da B ning ma\'lumoti yo\'q', foreign.length === 0);

    // ── 3. business jadvalining o'zi ham izolyatsiyalangan ──
    const biz = await withTenant(idA, (tx) => tx.select().from(business));
    check(
      'A faqat o\'z biznesini ko\'radi',
      biz.length === 1 && biz[0]?.id === idA,
      `topildi: ${biz.length}`,
    );

    // ── 4. Begona business_id bilan YOZIB BO'LMAYDI (WITH CHECK) ──
    let writeBlocked = false;
    try {
      await withTenant(idA, (tx) =>
        tx.insert(conversation).values({
          businessId: idB, // ← begona tenant
          channel: 'phone',
          direction: 'outbound',
          externalId: `evil-${suffix}`,
          startedAt: new Date(),
        }),
      );
    } catch {
      writeBlocked = true;
    }
    check('A tenant B ga yoza olmaydi', writeBlocked);

    // ── 5. Begona qatorni YANGILAB BO'LMAYDI ──
    const updated = await withTenant(idA, (tx) =>
      tx
        .update(conversation)
        .set({ excludedReason: 'buzilgan' })
        .where(sql`${conversation.businessId} = ${idB}`)
        .returning({ id: conversation.id }),
    );
    check('A tenant B qatorini yangilay olmaydi', updated.length === 0);

    // ── 6. Kontekstsiz hech narsa ko'rinmaydi (sukut bo'yicha yopiq) ──
    const noCtx = await db.select().from(conversation);
    check(
      'kontekstsiz so\'rov bo\'sh qaytaradi',
      noCtx.length === 0,
      `topildi: ${noCtx.length}`,
    );
  } finally {
    await withoutTenantIsolation('test tozalash: yaratilgan tenantlarni o\'chirish', async (tx) => {
      await tx.delete(business).where(sql`${business.slug} in (${slugA}, ${slugB})`);
    });
  }

  console.log(
    failures === 0
      ? '\nIzolyatsiya butun. 6/6 tekshiruv o\'tdi.\n'
      : `\n${failures} ta tekshiruv MUVAFFAQIYATSIZ. Deploy qilmang.\n`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
