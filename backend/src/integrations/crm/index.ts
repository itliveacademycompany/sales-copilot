import { z } from 'zod';
import type { CrmAdapter, CrmKind } from './adapter.js';
import { amocrmAdapter } from './amocrm.js';
import { bitrix24Adapter } from './bitrix24.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CRM RO'YXATI — yangi CRM shu yerga qo'shiladi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Yangi CRM: `<crm>.ts` da `CrmAdapter` yozing, shu ro'yxatga qo'shing va
 * `integration_kind` enumiga turini qo'shing (migratsiya). CRM sahifasi,
 * API va worker uni o'zi taniydi — boshqa joyni o'zgartirish kerak emas.
 */
export const ADAPTERLAR: Record<CrmKind, CrmAdapter> = {
  amocrm: amocrmAdapter,
  bitrix24: bitrix24Adapter,
};

export const CRM_TURLARI = Object.keys(ADAPTERLAR) as CrmKind[];

export function crmTurimi(s: string): s is CrmKind {
  return (CRM_TURLARI as string[]).includes(s);
}

/**
 * Har ulanish uchun SotuvAI xulqi (`integration.config.crmSozlama`).
 *
 * `boshlanish` — shu paytdan KEYIN tahlil qilingan qo'ng'iroqlargina CRM ga
 * yoziladi. Aks holda ulangan zahoti eski yuzlab qo'ng'iroq bir zumda
 * CRM ga izoh bo'lib to'kilardi.
 */
export const crmSozlamaSchema = z.object({
  izoh: z.boolean().default(true),
  vazifa: z.boolean().default(true),
  boshlanish: z.string().nullable().default(null),
});
export type CrmSozlama = z.infer<typeof crmSozlamaSchema>;

export function sozlamaniOl(config: unknown): CrmSozlama {
  const c = (config ?? {}) as Record<string, unknown>;
  const r = crmSozlamaSchema.safeParse(c.crmSozlama ?? {});
  return r.success ? r.data : crmSozlamaSchema.parse({});
}

export function crmConfigniOl(config: unknown): Record<string, unknown> {
  const c = (config ?? {}) as Record<string, unknown>;
  if (c.crm && typeof c.crm === 'object') return c.crm as Record<string, unknown>;
  // Birinchi versiya (faqat amoCRM) sozlamani `amocrm` kalitida saqlagan
  if (c.amocrm && typeof c.amocrm === 'object') {
    const eski = c.amocrm as Record<string, unknown>;
    return {
      ...eski,
      address: typeof eski.subdomain === 'string' ? `${eski.subdomain}.${String(eski.baseDomain ?? 'amocrm.ru')}` : undefined,
    };
  }
  return {};
}

export { CrmXato } from './adapter.js';
export type { CrmAdapter, CrmKind, CrmKontekst, CrmYozuv } from './adapter.js';
