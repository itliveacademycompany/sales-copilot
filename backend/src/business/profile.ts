import { z } from 'zod';

/**
 * FR-11: biznes anketasi.
 *
 * Bu obyekt AI Playbook Builder uchun kirish ma'lumoti va keyinchalik
 * promptlarga tushadi. Maydonlar sotuv bo'limining amaliy ehtiyojidan
 * kelib chiqib tanlangan va foydalanuvchi uchun savol shaklida berilgan.
 *
 * Deyarli hamma maydon ixtiyoriy — onboarding'ni yarimdan tashlab
 * ketmaslik uchun. To'liqlik `completeness` orqali o'lchanadi.
 *
 * Alohida modulga chiqarilgan (routes/business.ts dan): AI Playbook
 * Builder (`ai/playbook-builder.ts`) ham shu sxemaga muhtoj, va
 * `ai/*` modullari `http/routes/*` ga bog'lanmasligi kerak.
 */
export const profileSchema = z.object({
  businessDescription: z.string().trim().max(2000).default(''),
  primaryOffers: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
  typicalCustomers: z.string().trim().max(1000).default(''),
  customerProblem: z.string().trim().max(1000).default(''),
  customerType: z.enum(['b2b', 'b2c', 'both']).default('b2c'),
  leadSources: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  salesModel: z.string().trim().max(200).default(''),
  callDirection: z.enum(['inbound', 'outbound', 'mixed']).default('mixed'),
  salesCycle: z.string().trim().max(200).default(''),
  avgDealAmount: z.number().nonnegative().nullable().default(null),
  avgDealCurrency: z.string().trim().max(10).default('UZS'),
  decisionMakers: z.string().trim().max(500).default(''),
  mustCaptureFields: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  commonCustomerQuestions: z.array(z.string().trim().min(1).max(300)).max(30).default([]),
  commonObjections: z.array(z.string().trim().min(1).max(300)).max(30).default([]),
  successSignals: z.array(z.string().trim().min(1).max(300)).max(30).default([]),
  failureSignals: z.array(z.string().trim().min(1).max(300)).max(30).default([]),
  redLines: z.array(z.string().trim().min(1).max(300)).max(30).default([]),
  sensitiveTopics: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
  excludedRoutes: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
  /** STT aniqligi uchun soha atamalari — o'zbek tilida hal qiluvchi. */
  vocabulary: z.array(z.string().trim().min(1).max(80)).max(200).default([]),
  additionalNotes: z.string().trim().max(2000).default(''),
});

export type BusinessProfile = z.infer<typeof profileSchema>;

/** Playbook generatsiyasi uchun eng zarur maydonlar. */
const REQUIRED_FOR_PLAYBOOK: (keyof BusinessProfile)[] = [
  'businessDescription',
  'primaryOffers',
  'typicalCustomers',
  'customerProblem',
  'commonObjections',
];

export function profileCompleteness(profile: BusinessProfile): {
  percent: number;
  missing: string[];
  readyForPlaybook: boolean;
} {
  const filled = (key: keyof BusinessProfile): boolean => {
    const v = profile[key];
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'string') return v.trim().length > 0;
    return v !== null && v !== undefined;
  };

  const keys = Object.keys(profileSchema.shape) as (keyof BusinessProfile)[];
  const done = keys.filter(filled).length;
  const missing = REQUIRED_FOR_PLAYBOOK.filter((k) => !filled(k));

  return {
    percent: Math.round((done / keys.length) * 100),
    missing,
    readyForPlaybook: missing.length === 0,
  };
}
