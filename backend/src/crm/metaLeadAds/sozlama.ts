import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { config } from '../../config.js';
import { decryptSecret } from '../../crypto/secrets.js';
import { withoutTenantIsolation, withTenant } from '../../db/index.js';
import { metaAppConfig } from '../../db/schema/index.js';
import { rootUrl } from '../../http/tenant.js';

/**
 * Meta ilovasi sozlamasi. SaaS: har tashkilot O'Z Meta ilovasini kartada
 * kiritadi (`meta_app_config`, App Secret shifrlangan) — serverdagi env'ga
 * tegilmaydi. Kiritmagan tashkilot uchun zaxira — platforma ilovasi (env).
 */

/**
 * So'raladigan ruxsatlar — Meta Lead Ads hujjatidagi endpointlar bo'yicha:
 *   pages_show_list        — foydalanuvchi boshqaradigan sahifalar ro'yxati (/me/accounts)
 *   pages_read_engagement  — sahifa ma'lumoti (dependency)
 *   pages_manage_metadata  — sahifani ilova webhook'iga obuna qilish (/{page}/subscribed_apps)
 *   leads_retrieval        — lid ma'lumotini o'qish (/{leadgen_id}, /{form}/leads)
 *   pages_manage_ads       — sahifaning Instant Form'lari (/{page}/leadgen_forms); App Review'da talab qilinadi
 *   ads_management         — lidning reklama/kampaniya identifikatorlari va webhook obunasi (Meta hujjatidagi ro'yxat)
 * `business_management` ataylab yo'q: faqat sahifa biznes portfeli orqali
 * berilganda kerak bo'ladi — u holda `META_OAUTH_SCOPES` yoki Login for
 * Business konfiguratsiyasiga qo'shiladi. Instagram/Messenger ruxsatlari yo'q.
 */
export const STANDART_RUXSATLAR = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_metadata',
  'leads_retrieval',
  'pages_manage_ads',
  'ads_management',
] as const;

/** Bularsiz ulanish ishlamaydi — callback'dan keyin tekshiriladi. */
export const MAJBURIY_RUXSATLAR = ['pages_show_list', 'pages_manage_metadata', 'leads_retrieval'] as const;

export const CALLBACK_YOLI = '/api/v1/crm/oauth/meta/callback';
export const WEBHOOK_YOLI = '/api/v1/webhooks/crm/meta';

export interface MetaSozlama {
  appId: string;
  appSecret: string;
  configId: string | null;
  versiya: string;
  redirectUri: string;
  verifyToken: string;
  ruxsatlar: string[];
  /** `kompaniya` — tashkilotning o'z ilovasi (bazada), `platforma` — env. */
  manba: 'kompaniya' | 'platforma';
  /** Kompaniya ilovasi qatori (`meta_app_config.id`) — webhook manzili shundan. */
  ilovaId: string | null;
}

export function tashqiManzil(): string {
  return (config.PUBLIC_URL ?? rootUrl()).replace(/\/+$/, '');
}

/** Kompaniya ilovasining webhook yo'li — har tashkilotga alohida (imzo o'z App Secret'i bilan). */
export const KOMPANIYA_WEBHOOK_YOLI = '/api/v1/webhooks/crm/meta-app';

export function kompaniyaManzillari(ilovaId: string) {
  const asos = `${tashqiManzil()}${KOMPANIYA_WEBHOOK_YOLI}/${ilovaId}`;
  return { webhookUrl: asos, deauthorizeUrl: `${asos}/deauthorize`, dataDeletionUrl: `${asos}/data-deletion` };
}

function ruxsatlar(): string[] {
  return config.META_OAUTH_SCOPES ? config.META_OAUTH_SCOPES.split(',').map((s) => s.trim()).filter(Boolean) : [...STANDART_RUXSATLAR];
}

export interface IlovaQatori {
  id: string;
  appId: string | null;
  appSecretEncrypted: Buffer | null;
  loginConfigId: string | null;
  verifyToken: string;
}

/**
 * Qaysi ilova ishlatiladi: kompaniyaning to'liq sozlangan ilovasi (App ID +
 * App Secret) ustun, bo'lmasa platforma (env). Sof funksiya — testda bazasiz.
 */
export function sozlamaniYig(qator: IlovaQatori | null | undefined, ochish: (b: Buffer) => string, platforma: MetaSozlama | null): MetaSozlama | null {
  if (qator?.appId && qator.appSecretEncrypted) {
    let appSecret: string;
    try {
      appSecret = ochish(qator.appSecretEncrypted);
    } catch {
      return null;
    }
    return {
      appId: qator.appId,
      appSecret,
      configId: qator.loginConfigId,
      versiya: grafVersiyasi(),
      redirectUri: redirectUri(),
      verifyToken: qator.verifyToken,
      ruxsatlar: ruxsatlar(),
      manba: 'kompaniya',
      ilovaId: qator.id,
    };
  }
  return platforma;
}

const QATOR_MAYDONLARI = {
  id: metaAppConfig.id,
  businessId: metaAppConfig.businessId,
  appId: metaAppConfig.appId,
  appSecretEncrypted: metaAppConfig.appSecretEncrypted,
  loginConfigId: metaAppConfig.loginConfigId,
  verifyToken: metaAppConfig.verifyToken,
};

/** Tashkilot uchun amaldagi sozlama (kompaniya ilovasi yoki platforma). */
export async function kompaniyaSozlamasi(businessId: string): Promise<MetaSozlama | null> {
  const [q] = await withTenant(businessId, (tx) => tx.select(QATOR_MAYDONLARI).from(metaAppConfig).limit(1));
  return sozlamaniYig(q, decryptSecret, metaSozlama());
}

/** Webhook: ilova qatori ID si bo'yicha (tenant konteksti yo'q). */
export async function ilovaBoyicha(ilovaId: string): Promise<{ businessId: string; s: MetaSozlama | null; verifyToken: string } | null> {
  const [q] = await withoutTenantIsolation('Meta webhook: kompaniya ilovasi id bo‘yicha — tenant konteksti yo‘q', (tx) =>
    tx.select(QATOR_MAYDONLARI).from(metaAppConfig).where(eq(metaAppConfig.id, ilovaId)).limit(1),
  );
  if (!q) return null;
  return { businessId: q.businessId, s: sozlamaniYig(q, decryptSecret, null), verifyToken: q.verifyToken };
}

/** O'z to'liq ilovasi bor tashkilotlar — platforma webhook'i ularning sahifalarini qabul qilmaydi. */
export async function oziIlovaliBizneslar(businessIds: string[]): Promise<Set<string>> {
  if (!businessIds.length) return new Set();
  const r = await withoutTenantIsolation('Meta webhook: qaysi tashkilotlarning o‘z ilovasi bor', (tx) =>
    tx
      .select({ businessId: metaAppConfig.businessId })
      .from(metaAppConfig)
      .where(and(inArray(metaAppConfig.businessId, businessIds), isNotNull(metaAppConfig.appId), isNotNull(metaAppConfig.appSecretEncrypted))),
  );
  return new Set(r.map((x) => x.businessId));
}

export function grafVersiyasi(): string {
  return config.META_GRAPH_API_VERSION ?? config.META_GRAPH_VERSION;
}

export function redirectUri(): string {
  return config.META_OAUTH_REDIRECT_URI ?? `${tashqiManzil()}${CALLBACK_YOLI}`;
}

export function webhookManzili(): string {
  return `${tashqiManzil()}${WEBHOOK_YOLI}`;
}

/** Qaysi env yetishmaydi — faqat administratorga ko'rsatiladi. */
export function yetishmaydi(): string[] {
  const y: string[] = [];
  if (!config.META_APP_ID) y.push('META_APP_ID');
  if (!config.META_APP_SECRET) y.push('META_APP_SECRET');
  if (!config.META_WEBHOOK_VERIFY_TOKEN) y.push('META_WEBHOOK_VERIFY_TOKEN');
  return y;
}

/**
 * PLATFORMA ilovasi (env) — zaxira: tashkilot o'z ilovasini kiritmagan bo'lsa.
 * To'liq sozlanmagan bo'lsa null.
 */
export function metaSozlama(): MetaSozlama | null {
  if (yetishmaydi().length) return null;
  return {
    appId: config.META_APP_ID!,
    appSecret: config.META_APP_SECRET!,
    configId: config.META_LOGIN_CONFIG_ID ?? null,
    versiya: grafVersiyasi(),
    redirectUri: redirectUri(),
    verifyToken: config.META_WEBHOOK_VERIFY_TOKEN!,
    ruxsatlar: ruxsatlar(),
    manba: 'platforma',
    ilovaId: null,
  };
}

/**
 * Meta ruxsat oynasi. Login for Business konfiguratsiyasi bo'lsa `config_id`
 * (ruxsatlar Meta panelida tanlangan), aks holda `scope`. `rerequest` —
 * oldin rad etilgan ruxsatlarni qayta so'rash ("Qayta ulash").
 */
export function dialogManzili(s: MetaSozlama, state: string, qaytaSora: boolean): string {
  const p = new URLSearchParams({ client_id: s.appId, redirect_uri: s.redirectUri, state, response_type: 'code' });
  if (s.configId) p.set('config_id', s.configId);
  else p.set('scope', s.ruxsatlar.join(','));
  if (qaytaSora) p.set('auth_type', 'rerequest');
  return `https://www.facebook.com/${s.versiya}/dialog/oauth?${p.toString()}`;
}
