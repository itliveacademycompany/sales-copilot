import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { encryptSecret, maskSecret } from '../crypto/secrets.js';
import { withoutTenantIsolation } from './index.js';
import { aiProvider } from './schema/index.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OPENAI-UYG'UN LLM PROVAYDERINI QO'SHISH
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Groq, OpenRouter, Cerebras, Together va boshqalar bir xil OpenAI-uyg'un
 * API beradi — farqi faqat `baseUrl` va model nomida. Shuning uchun bitta
 * skript hammasiga yetadi va sxema migratsiyasi kerak emas.
 *
 * Ishga tushirish (kalit MUHIT O'ZGARUVCHISIDA — shell tarixida qolmasin):
 *
 *   LLM_API_KEY=xxx LLM_PRESET=openrouter npm run provider:llm
 *
 * Presetlar: groq | openrouter | cerebras | together
 * Yoki qo'lda:  LLM_BASE_URL=... LLM_MODEL=...
 */

interface Preset {
  baseUrl: string;
  model: string;
  izoh: string;
}

const PRESETLAR: Record<string, Preset> = {
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    izoh: 'Tez va bepul, lekin ba\'zi mintaqalarni bloklaydi (403)',
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'meta-llama/llama-3.3-70b-instruct',
    izoh: 'Ko\'p model bitta API orqali, bepul variantlari bor',
  },
  cerebras: {
    baseUrl: 'https://api.cerebras.ai/v1',
    model: 'llama-3.3-70b',
    izoh: 'Juda tez, bepul tarif bor',
  },
  together: {
    baseUrl: 'https://api.together.xyz/v1',
    model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    izoh: 'Keng model tanlovi',
  },
  /**
   * Google Gemini — rasmiy OpenAI-uyg'un endpoint orqali. Kalit
   * aistudio.google.com da BEPUL va KARTASIZ olinadi (bu Google Cloud
   * emas — alohida, oddiyroq mahsulot). Bepul kunlik limiti
   * OpenRouter'ning `:free` modellaridan sezilarli yuqori.
   */
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.5-flash',
    izoh: 'aistudio.google.com — bepul, kartasiz, OpenRouter\'dan yuqori limit',
  },
};

const KALIT = process.env.LLM_API_KEY;
const PRESET_NOMI = process.env.LLM_PRESET ?? 'openrouter';

async function main() {
  if (!KALIT) {
    console.error(
      'LLM_API_KEY berilmadi.\n\n' +
        'Foydalanish:\n' +
        '  LLM_API_KEY=xxx LLM_PRESET=openrouter npm run provider:llm\n\n' +
        'Mavjud presetlar:\n' +
        Object.entries(PRESETLAR)
          .map(([k, v]) => `  ${k.padEnd(11)} ${v.model.padEnd(45)} — ${v.izoh}`)
          .join('\n'),
    );
    process.exit(1);
  }

  const preset = PRESETLAR[PRESET_NOMI];
  const baseUrl = process.env.LLM_BASE_URL ?? preset?.baseUrl;
  const model = process.env.LLM_MODEL ?? preset?.model;

  if (!baseUrl || !model) {
    console.error(
      `Noma'lum preset: ${PRESET_NOMI}. Mavjud: ${Object.keys(PRESETLAR).join(', ')}\n` +
        'Yoki LLM_BASE_URL va LLM_MODEL ni qo\'lda bering.',
    );
    process.exit(1);
  }

  // ─── Kalit ishlashini OLDINDAN tekshiramiz ───
  // Bazaga ishlamaydigan kalit yozib qo'yish foydasiz: nosozlik keyinroq,
  // tahlil vaqtida chiqadi va sababi noaniq bo'ladi.
  process.stdout.write(`Tekshirilmoqda: ${baseUrl} … `);
  let tekshiruv: Response;
  try {
    tekshiruv = await fetch(`${baseUrl}/models`, {
      headers: { authorization: `Bearer ${KALIT}` },
    });
  } catch (e) {
    console.log('XATO');
    console.error(`Tarmoq xatosi: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }

  if (!tekshiruv.ok) {
    console.log(`XATO (HTTP ${tekshiruv.status})`);
    const matn = (await tekshiruv.text()).slice(0, 200);
    console.error(matn);
    if (tekshiruv.status === 403) {
      console.error(
        '\n403 odatda kalit emas, TARMOQ/MINTAQA blokini bildiradi.\n' +
          'Boshqa presetni sinab ko\'ring: LLM_PRESET=openrouter',
      );
    }
    if (tekshiruv.status === 401) {
      console.error('\n401 — kalit noto\'g\'ri yoki muddati o\'tgan.');
    }
    process.exit(1);
  }
  console.log('OK');

  await withoutTenantIsolation('setup: LLM provayderini qo\'shish', async (tx) => {
    const label = PRESET_NOMI;
    const [bor] = await tx
      .select({ id: aiProvider.id })
      .from(aiProvider)
      .where(eq(aiProvider.label, label))
      .limit(1);

    const qiymatlar = {
      purpose: 'llm' as const,
      kind: 'openai' as const,
      label,
      apiKeyEncrypted: encryptSecret(KALIT),
      apiKeyHint: maskSecret(KALIT),
      apiKeyRotatedAt: new Date(),
      baseUrl,
      models: {
        stage2: model,
        stage3: model,
        playbookBuilder: model,
        // Zaif modellar katta sxemani uddalay olmaydi — LLM_SPLIT berilsa
        // so'rov shuncha maydonlik bo'laklarga bo'linadi.
        ...(process.env.LLM_SPLIT ? { splitFields: Number(process.env.LLM_SPLIT) } : {}),
      },
      isActive: true,
    };

    // Faqat bitta faol LLM provayderi bo'lishi kerak.
    await tx.update(aiProvider).set({ isActive: false }).where(eq(aiProvider.purpose, 'llm'));

    if (bor) {
      await tx.update(aiProvider).set(qiymatlar).where(eq(aiProvider.id, bor.id));
      console.log('Provayder YANGILANDI:', label);
    } else {
      await tx.insert(aiProvider).values(qiymatlar);
      console.log('Provayder QO\'SHILDI:', label);
    }
    console.log('Model:', model);
    if (process.env.LLM_SPLIT) {
      console.log('Sxema bo\'lish:', process.env.LLM_SPLIT, 'maydondan');
    }
  });

  process.exit(0);
}

main().catch((e) => {
  console.error('XATO:', e instanceof Error ? e.message : e);
  process.exit(1);
});
