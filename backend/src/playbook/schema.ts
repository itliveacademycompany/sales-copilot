import { z } from 'zod';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PLAYBOOK STRUKTURASI VA VALIDATSIYASI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Playbook `jsonb` da saqlanadi, lekin **shakli qat'iy tekshiriladi**.
 *
 * Nega: bu obyekt AI promptiga aylanadi va baholash natijasini belgilaydi.
 * Buzilgan playbook jim ravishda noto'g'ri baholarga olib keladi —
 * xato bermaydi, shunchaki yomon natija beradi. Bunday nosozlikni
 * keyinchalik topish juda qiyin, shuning uchun kirishda to'xtatamiz.
 */

/** 0–3 ballik anchor rubrika. Har bir daraja kuzatiladigan xatti-harakat. */
export const rubricSchema = z.object({
  '0': z.string().trim().min(5, 'Rubrika tavsifi juda qisqa'),
  '1': z.string().trim().min(5),
  '2': z.string().trim().min(5),
  '3': z.string().trim().min(5),
});

export type Rubric = z.infer<typeof rubricSchema>;

/** Mezon kodi: bitta harf + raqam (A1, B2, F1). Kategoriya harfiga mos keladi. */
const criterionCode = z
  .string()
  .trim()
  .regex(/^[A-Z]\d{1,2}$/, 'Mezon kodi A1 ko\'rinishida bo\'lishi kerak');

const categoryCode = z
  .string()
  .trim()
  .regex(/^[A-Z]$/, 'Kategoriya kodi bitta katta harf bo\'lishi kerak');

export const categorySchema = z.object({
  code: categoryCode,
  name: z.string().trim().min(2).max(80),
  /** Vazn foizda. Barcha kategoriyalar yig'indisi aynan 100 bo'lishi shart. */
  weightPct: z.number().min(0).max(100),
  order: z.number().int().min(0).default(0),
});

export const criterionSchema = z.object({
  code: criterionCode,
  categoryCode,
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(600),
  rubric: rubricSchema,
  /** Bo'sh massiv = barcha holatlar uchun (filtr yo'q). */
  appliesTo: z
    .object({
      callFamilies: z.array(z.string()).default([]),
      serviceLines: z.array(z.string()).default([]),
      directions: z.array(z.enum(['inbound', 'outbound'])).default([]),
    })
    .default({ callFamilies: [], serviceLines: [], directions: [] }),
  /** FR-24: o'chirmasdan vaqtincha faolsizlantirish. */
  isActive: z.boolean().default(true),
  order: z.number().int().min(0).default(0),
});

export type Category = z.infer<typeof categorySchema>;
export type Criterion = z.infer<typeof criterionSchema>;

/**
 * To'liq mezonlar bloki. Bu yerda strukturaviy qoidalar tekshiriladi:
 * vaznlar yig'indisi, takroriy kodlar, yetim mezonlar.
 */
export const criteriaSchema = z
  .object({
    categories: z.array(categorySchema).min(1, 'Kamida bitta kategoriya kerak'),
    criteria: z.array(criterionSchema).min(1, 'Kamida bitta mezon kerak'),
  })
  .superRefine((value, ctx) => {
    // ── Kategoriya kodlari takrorlanmasin ──
    const catCodes = new Set<string>();
    for (const c of value.categories) {
      if (catCodes.has(c.code)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['categories'],
          message: `Kategoriya kodi takrorlangan: ${c.code}`,
        });
      }
      catCodes.add(c.code);
    }

    // ── Vaznlar yig'indisi aynan 100% ──
    // Suzuvchi nuqta xatosiga yo'l qo'ymaslik uchun 0.01 tolerantlik.
    const total = value.categories.reduce((sum, c) => sum + c.weightPct, 0);
    if (Math.abs(total - 100) > 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['categories'],
        message: `Vaznlar yig'indisi 100% bo'lishi kerak, hozir ${total.toFixed(2)}%`,
      });
    }

    // ── Mezon kodlari takrorlanmasin ──
    const critCodes = new Set<string>();
    for (const c of value.criteria) {
      if (critCodes.has(c.code)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['criteria'],
          message: `Mezon kodi takrorlangan: ${c.code}`,
        });
      }
      critCodes.add(c.code);

      // ── Har mezon mavjud kategoriyaga tegishli bo'lsin ──
      if (!catCodes.has(c.categoryCode)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['criteria'],
          message: `"${c.code}" mezoni mavjud bo'lmagan "${c.categoryCode}" kategoriyasiga bog'langan`,
        });
      }

      // ── Kod kategoriya harfiga mos kelsin (A1 → A kategoriyasi) ──
      if (c.code[0] !== c.categoryCode) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['criteria'],
          message: `"${c.code}" kodi "${c.categoryCode}" kategoriyasiga mos emas`,
        });
      }
    }

    // ── Har kategoriyada kamida bitta faol mezon bo'lsin ──
    // Aks holda vazni bor, lekin baholanmaydigan kategoriya paydo bo'ladi
    // va umumiy foiz jim ravishda noto'g'ri hisoblanadi.
    for (const cat of value.categories) {
      const active = value.criteria.filter(
        (c) => c.categoryCode === cat.code && c.isActive,
      );
      if (active.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['criteria'],
          message: `"${cat.name}" (${cat.code}) kategoriyasida birorta faol mezon yo'q`,
        });
      }
    }
  });

export type Criteria = z.infer<typeof criteriaSchema>;

/** FR-28: suhbatdan yig'iladigan tuzilgan ma'lumot. */
export const questionnaireSchema = z.object({
  title: z.string().trim().max(120).default('Anketa'),
  questions: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(40),
        question: z.string().trim().min(5).max(300),
        answerType: z.enum(['boolean', 'text', 'number', 'date']),
        required: z.boolean().default(false),
      }),
    )
    .default([]),
});

/** FR-25/30: qo'ng'iroq oilalari va qizil bayroqlar. */
export const classificationPolicySchema = z.object({
  callFamilies: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(60),
        name: z.string().trim().min(2).max(120),
        description: z.string().trim().max(500).default(''),
        /** Shu oila playbook bo'yicha baholanadimi yoki chiqariladimi. */
        scored: z.boolean().default(true),
      }),
    )
    .default([]),
  redFlags: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(60),
        description: z.string().trim().min(5).max(400),
        severity: z.enum(['warning', 'critical']).default('warning'),
      }),
    )
    .default([]),
  serviceLines: z.array(z.string().trim().min(1).max(120)).default([]),
});

/** AI quvurining bosqichlari uchun ko'rsatmalar. */
export const promptNotesSchema = z.object({
  stage1: z
    .object({
      /** STT aniqligi uchun domen atamalari — o'zbek tilida hal qiluvchi. */
      vocabulary: z.array(z.string().trim().min(1).max(80)).default([]),
      contextHint: z.string().trim().max(1000).default(''),
    })
    .default({ vocabulary: [], contextHint: '' }),
  stage2: z
    .object({
      businessContext: z.string().trim().max(3000).default(''),
      extractionHints: z.string().trim().max(2000).default(''),
      taskGuidance: z.string().trim().max(2000).default(''),
    })
    .default({ businessContext: '', extractionHints: '', taskGuidance: '' }),
  stage3: z
    .object({
      scoringGuidance: z.string().trim().max(3000).default(''),
      coachingNotes: z.string().trim().max(2000).default(''),
      complianceNotes: z.string().trim().max(2000).default(''),
    })
    .default({ scoringGuidance: '', coachingNotes: '', complianceNotes: '' }),
});

/** Saqlash uchun to'liq playbook tanasi. */
export const playbookBodySchema = z.object({
  criteria: criteriaSchema,
  questionnaire: questionnaireSchema.default({ title: 'Anketa', questions: [] }),
  classificationPolicy: classificationPolicySchema.default({
    callFamilies: [],
    redFlags: [],
    serviceLines: [],
  }),
  promptNotes: promptNotesSchema.default({}),
  leadQuality: z.record(z.unknown()).default({}),
  changeNote: z.string().trim().max(300).optional(),
});

export type PlaybookBody = z.infer<typeof playbookBodySchema>;
