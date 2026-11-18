import { config } from '../../config.js';
import { rootUrl } from '../../http/tenant.js';

/**
 * Meta ilovasi sozlamasi (env). Platformada BITTA ilova — CRM operatori bir
 * marta sozlaydi; mijoz hech qanday kalit kiritmaydi.
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
}

function tashqiManzil(): string {
  return (config.PUBLIC_URL ?? rootUrl()).replace(/\/+$/, '');
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

/** To'liq sozlangan bo'lsa — sozlama, aks holda null ("Integratsiya hali sozlanmagan"). */
export function metaSozlama(): MetaSozlama | null {
  if (yetishmaydi().length) return null;
  const ruxsatlar = config.META_OAUTH_SCOPES
    ? config.META_OAUTH_SCOPES.split(',').map((s) => s.trim()).filter(Boolean)
    : [...STANDART_RUXSATLAR];
  return {
    appId: config.META_APP_ID!,
    appSecret: config.META_APP_SECRET!,
    configId: config.META_LOGIN_CONFIG_ID ?? null,
    versiya: grafVersiyasi(),
    redirectUri: redirectUri(),
    verifyToken: config.META_WEBHOOK_VERIFY_TOKEN!,
    ruxsatlar,
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
