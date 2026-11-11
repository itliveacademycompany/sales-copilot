import { sql } from 'drizzle-orm';
import { withTenant } from '../db/index.js';
import { trainingScenario } from '../db/schema/index.js';
import { parseScenario } from '../training/scenario/schema.js';
import { TAYYOR_SSENARIYLAR } from './tayyor-ssenariylar.js';

/**
 * Tayyor ssenariylarni biznesga qo'shish — birinchi kirishda, bir marta.
 *
 * Modulning `upsertScenario` i ma'lumot farq qilsa QAYTA YOZADI — rahbar
 * tayyor ssenariyni tahrirlagan bo'lsa, uning o'zgarishi yo'qolardi. Shu
 * sababli bu yerda faqat "yo'q bo'lsa qo'sh" (`on conflict do nothing`):
 * keyinroq qo'shilgan yangi tayyor ssenariy ham keladi, tahrirlangani esa
 * tegilmaydi. Arxivlangan ssenariy ham qatori bor — qayta tiklanmaydi.
 *
 * Jarayon xotirasida "bu biznes tekshirildi" belgisi turadi — har so'rovda
 * bazaga yozilmaydi (server qayta ishga tushsa bir marta qayta tekshiriladi).
 */
const tekshirildi = new Set<string>();

const TAYYOR = TAYYOR_SSENARIYLAR.map((s) => parseScenario(s, 'tayyor ssenariy'));

export async function tayyorSsenariylarniQosh(businessId: string): Promise<void> {
  if (tekshirildi.has(businessId)) return;
  await withTenant(businessId, async (tx) => {
    for (const s of TAYYOR) {
      await tx
        .insert(trainingScenario)
        .values({
          businessId,
          id: s.id,
          title: s.title_uz,
          difficulty: s.difficulty,
          insultLevel: s.behavior.insult_level,
          data: s,
          isActive: true,
          updatedAt: sql`now()`,
        })
        .onConflictDoNothing();
    }
  });
  tekshirildi.add(businessId);
}
