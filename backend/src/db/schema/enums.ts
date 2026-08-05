import { pgEnum } from 'drizzle-orm/pg-core';

// ─── Odamlar va rollar ────────────────────────────────────────────────────────

/** Platforma darajasidagi rol (biznesdan qat'i nazar). */
export const systemRole = pgEnum('system_role', [
  'super_admin',
  'business_owner',
  'partner',
  'user',
]);

/**
 * Biznes ichidagi rol. TZ 2.1 dagi rollar matritsasi.
 * `manager` (sotuvchi) bu jadvalda emas — u `seat` orqali beriladi.
 */
export const memberRole = pgEnum('member_role', [
  'owner', // Ega
  'supervisor', // Rahbar
  'head', // Bo'lim boshlig'i
  'auditor', // Auditor (faqat o'qish)
]);

/** Taklif qilingan foydalanuvchining aktivatsiya holati. */
export const activationStatus = pgEnum('activation_status', [
  'pending', // taklif yuborilgan, hali kirmagan
  'active',
  'disabled',
]);

// ─── Muloqot ──────────────────────────────────────────────────────────────────

/** Muloqot kanali. TZ 6.2: `conversation`, `call` emas — kanal kengaytiriladi. */
export const channel = pgEnum('channel', [
  'phone',
  'telegram',
  'meeting',
  'whatsapp',
  'instagram',
]);

export const direction = pgEnum('direction', ['inbound', 'outbound', 'na']);

/** Ishlov berish quvuri holati. */
export const conversationStatus = pgEnum('conversation_status', [
  'received', // qabul qilindi, navbatga qo'yilmadi
  'filtered', // pre-filter chiqarib tashladi (LLM sarflanmadi)
  'queued',
  'transcribing',
  'analyzing',
  'done',
  'failed',
]);

export const speaker = pgEnum('speaker', ['manager', 'client', 'unknown', 'system']);

/**
 * FR-84: speaker roli qanday aniqlangani.
 * `llm_inferred` eng ishonchsizi — kuzatuvlarga ko'ra qo'ng'iroqlarning
 * ~5% ida rol almashib ketadi, ya'ni menejerning gapi mijozga yoziladi.
 */
export const speakerAttributionMethod = pgEnum('speaker_attribution_method', [
  'channel', // stereo yozuvda kanal bo'yicha — 100%
  'phone', // seat telefon raqami + yo'nalish bo'yicha — deterministik
  'telegram_id', // Telegram user id bo'yicha — 100%
  'llm_inferred', // faqat oxirgi chora, ishonch darajasi bilan
]);

// ─── Baholash ─────────────────────────────────────────────────────────────────

/** Bahoga e'tiroz (appeal) holati. FR-124. */
export const appealStatus = pgEnum('appeal_status', ['open', 'accepted', 'rejected']);

// ─── Vazifalar ────────────────────────────────────────────────────────────────

export const taskStatus = pgEnum('task_status', [
  'pending',
  'in_progress',
  'done',
  'cancelled',
  'blocked',
]);

export const taskSource = pgEnum('task_source', [
  'playbook_analysis', // baholangan sotuv suhbatidan
  'other_analysis', // baholanmagan, lekin tahlil qilingan suhbatdan
  'manual',
]);

export const commitmentParty = pgEnum('commitment_party', ['manager', 'client']);

export const commitmentStatus = pgEnum('commitment_status', ['pending', 'done', 'missed']);

// ─── Integratsiyalar ──────────────────────────────────────────────────────────

export const integrationKind = pgEnum('integration_kind', [
  'amocrm',
  'bitrix24',
  'telegram_bot',
  'telegram_user',
  'moizvonki',
  'binotel',
  'freepbx',
  'generic_webhook',
]);

export const integrationStatus = pgEnum('integration_status', [
  'disconnected',
  'connected',
  'error',
]);

export const syncDirection = pgEnum('sync_direction', ['in', 'out']);

// ─── Billing ──────────────────────────────────────────────────────────────────

/**
 * FR-155/156: `grace` — to'lov kechikdi, hammasi ishlaydi.
 * `degraded` — yangi tahlil to'xtaydi, LEKIN ma'lumot yig'ish davom etadi
 * va eski ma'lumot ko'rinadi.
 */
export const subscriptionStatus = pgEnum('subscription_status', [
  'trial',
  'active',
  'past_due',
  'grace',
  'degraded',
  'cancelled',
]);

export const transactionType = pgEnum('transaction_type', [
  'topup',
  'charge',
  'refund',
  'bonus',
  'partner_commission',
]);

// ─── Ogohlantirishlar ─────────────────────────────────────────────────────────

export const alertKind = pgEnum('alert_kind', [
  'red_flag',
  'quality_drop',
  'missed_lead',
  'broken_commitment',
  'sync_error',
  'low_confidence', // AI o'ziga ishonchi past — inson ko'rigi kerak (FR-83)
  'score_appeal', // sotuvchi bahoga e'tiroz bildirdi (FR-124)
]);

export const alertSeverity = pgEnum('alert_severity', ['info', 'warning', 'critical']);

export const alertStatus = pgEnum('alert_status', ['new', 'seen', 'resolved']);
