import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  appealStatus,
  channel,
  conversationStatus,
  direction,
  speaker,
  speakerAttributionMethod,
} from './enums.js';
import { playbook } from './playbook.js';
import { appUser, business, seat } from './tenant.js';

/** Mijoz (kontakt). CRM dan keladi yoki suhbatdan ekstraksiya qilinadi. */
export const contact = pgTable(
  'contact',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),

    name: text('name'),
    phone: text('phone'),
    telegramId: text('telegram_id'),
    company: text('company'),
    role: text('role'),
    isDecisionMaker: boolean('is_decision_maker'),

    crmContactId: text('crm_contact_id'),
    crmLeadId: text('crm_lead_id'),

    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('contact_business_phone_idx').on(t.businessId, t.phone),
    index('contact_business_crm_idx').on(t.businessId, t.crmContactId),
    /**
     * Telegram xususiy chatida chat id = foydalanuvchi id. Shu tufayli
     * bitta mijoz ikkinchi marta yozganda YANGI kontakt yaratilmaydi —
     * "bu kontakt bilan oldingi suhbatlar" (FR-112 atrofidagi kouching
     * kontekst) shu indeks orqali ishlaydi. Oddiy (partial bo'lmagan)
     * unikal indeks — Postgres'da bir nechta NULL bir-biriga zid
     * hisoblanmaydi, shuning uchun CRM'dan kelgan telegramId'siz
     * kontaktlarga ta'sir qilmaydi.
     */
    uniqueIndex('contact_business_telegram_uq').on(t.businessId, t.telegramId),
  ],
);

/**
 * Muloqot — qo'ng'iroq, Telegram yozishma yoki uchrashuv.
 *
 * TZ 6.2: ataylab `call` emas, `conversation`. Entity'ni `call` deb nomlash
 * mahsulotni telefoniyaga qamab qo'yadi va keyin har yangi kanal uchun
 * migratsiya kerak bo'ladi. `channel` ustuni tufayli bizda
 * Telegram/uchrashuv/WhatsApp hech qanday migratsiyasiz qo'shiladi.
 */
export const conversation = pgTable(
  'conversation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    seatId: uuid('seat_id').references(() => seat.id, { onDelete: 'set null' }),
    contactId: uuid('contact_id').references(() => contact.id, { onDelete: 'set null' }),

    channel: channel('channel').notNull(),
    direction: direction('direction').notNull().default('na'),

    /**
     * Manbadagi identifikator (amoCRM call id, Telegram message id...).
     * `(businessId, channel, externalId)` unikal — takroriy qabulni
     * (webhook retry, sync overlap) idempotent qiladi. NFR-11.
     */
    externalId: text('external_id'),
    externalSource: text('external_source'), // amocrm | telegram_bot | upload | webhook

    /**
     * Uzluksiz oqim identifikatori: Telegram chat id, WhatsApp raqami va h.k.
     *
     * `externalId` bitta suhbat sessiyasini bildiradi, `externalThreadId` esa
     * o'sha ikki odam orasidagi butun yozishmani. Telegram'da suhbat tabiiy
     * chegaraga ega emas (qo'ng'iroqdan farqli), shuning uchun sessiyaga
     * bo'lish uchun oqimni topa olishimiz kerak.
     */
    externalThreadId: text('external_thread_id'),

    /**
     * Tashqi tizimdagi XODIM identifikatori (Moi Zvonki `user_id` va h.k.).
     *
     * Nega alohida ustun: qo'ng'iroq kelganda xodim hali hech qaysi
     * menejerga bog'lanmagan bo'lishi mumkin. Unda `seatId` bo'sh qoladi,
     * suhbat esa kutib turadi. Rahbar keyinroq xodimni menejerga
     * bog'laganda, kutayotgan qo'ng'iroqlar aynan shu ustun orqali topilib
     * o'sha menejerga o'tkaziladi — hech biri yo'qolmaydi.
     */
    externalUserId: text('external_user_id'),

    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    durationSeconds: integer('duration_seconds'),

    // ─── Media (audio bo'lsa) ───
    mediaUrl: text('media_url'),
    mediaFilename: text('media_filename'),
    mediaKind: text('media_kind'), // audio/mpeg, audio/ogg...
    mediaBytes: integer('media_bytes'),
    /** Stereo bo'lsa kanal bo'yicha rol aniqlanadi — FR-84 ning eng ishonchli yo'li. */
    mediaChannels: integer('media_channels'),

    /**
     * FR-64: gudok/IVR kesish. Tahlil `analysisStartSeconds` dan boshlanadi.
     * Amaliyotda yozuv chegarasi oqib ketishi uchraydi (bir faylda oldingi
     * qo'ng'iroqning oxiri qolib ketadi) — shuning uchun buni ham tekshiramiz.
     */
    recordingStartMode: text('recording_start_mode'),
    beepStartSeconds: numeric('beep_start_seconds', { precision: 8, scale: 2 }),
    beepEndSeconds: numeric('beep_end_seconds', { precision: 8, scale: 2 }),
    analysisStartSeconds: numeric('analysis_start_seconds', { precision: 8, scale: 2 }),

    phoneFrom: text('phone_from'),
    phoneTo: text('phone_to'),

    // ─── CRM bog'lanish ───
    crmLeadId: text('crm_lead_id'),
    crmContactId: text('crm_contact_id'),
    crmCallId: text('crm_call_id'),

    // ─── Quvur holati ───
    status: conversationStatus('status').notNull().default('received'),
    /** Pre-filter yoki AI nega chiqarib tashladi. */
    excludedReason: text('excluded_reason'),
    /** Ish vaqtidan tashqarimi (FR-163). */
    isOffHours: boolean('is_off_hours').notNull().default(false),

    language: text('language'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('conversation_external_uq').on(t.businessId, t.channel, t.externalId),
    index('conversation_business_started_idx').on(t.businessId, t.startedAt),
    // Oqimning oxirgi sessiyasini topish — har kelgan xabarda bajariladi.
    index('conversation_thread_idx').on(
      t.businessId,
      t.channel,
      t.externalThreadId,
      t.startedAt,
    ),
    index('conversation_seat_idx').on(t.businessId, t.seatId, t.startedAt),
    index('conversation_status_idx').on(t.businessId, t.status),
    /** Xodim bog'langanda kutayotgan qo'ng'iroqlarni topish. */
    index('conversation_external_user_idx').on(t.businessId, t.externalSource, t.externalUserId),
  ],
);

/**
 * Transkript segmenti.
 *
 * `endSeconds` **majburiy emas, lekin talab qilinadi**: u `null` bo'lsa
 * talk-ratio ni so'z soni bo'yicha hisoblashga to'g'ri keladi va natijada
 * 91-94% kabi ishonchsiz raqamlar chiqadi. Shuning uchun STT
 * provayderidan segment tugash vaqti talab qilinadi.
 */
export const transcriptSegment = pgTable(
  'transcript_segment',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversation.id, { onDelete: 'cascade' }),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),

    seq: integer('seq').notNull(),
    speaker: speaker('speaker').notNull(),
    text: text('text').notNull(),

    /**
     * Manbadagi xabar identifikatori (Telegram `message_id` va h.k.).
     *
     * Idempotentlik uchun: Telegram webhook'ni qayta yuborishi mumkin, va
     * biz javob bermasak u soatlab urinaveradi. Bu maydon bo'yicha unikal
     * indeks takroriy xabarni jim ravishda rad etadi.
     */
    externalId: text('external_id'),
    /** Kim yozgani — Telegram user id. FR-84: rolni aniq belgilash uchun. */
    externalSenderId: text('external_sender_id'),

    startSeconds: numeric('start_seconds', { precision: 8, scale: 2 }).notNull(),
    endSeconds: numeric('end_seconds', { precision: 8, scale: 2 }),
    confidence: numeric('confidence', { precision: 4, scale: 3 }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('transcript_segment_seq_uq').on(t.conversationId, t.seq),
    index('transcript_segment_conv_idx').on(t.conversationId),
    // Biznes doirasida global dedupe — xabar qaysi sessiyaga tushishidan qat'i nazar.
    uniqueIndex('transcript_segment_external_uq').on(t.businessId, t.externalId),
  ],
);

/** Bitta suhbatga bitta tahlil natijasi. */
export const analysis = pgTable(
  'analysis',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversation.id, { onDelete: 'cascade' }),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    seatId: uuid('seat_id').references(() => seat.id, { onDelete: 'set null' }),

    playbookId: uuid('playbook_id').references(() => playbook.id, { onDelete: 'set null' }),
    playbookVersion: integer('playbook_version'),

    /** { stt: "...", stage2: "...", stage3: "..." } — FR-87. */
    modelVersions: jsonb('model_versions').notNull().default(sql`'{}'::jsonb`),

    // ─── FR-84: speaker roli qanday aniqlangani ───
    speakerAttributionMethod: speakerAttributionMethod('speaker_attribution_method'),
    speakerAttributionConfidence: numeric('speaker_attribution_confidence', {
      precision: 4,
      scale: 3,
    }),

    // ─── Klassifikatsiya ───
    businessRelevance: text('business_relevance'),
    callFamily: text('call_family'),
    serviceLine: text('service_line'),
    classificationConfidence: numeric('classification_confidence', { precision: 4, scale: 3 }),
    scoringMode: text('scoring_mode'),

    // ─── Baholar ───
    overallScore: numeric('overall_score', { precision: 5, scale: 2 }),
    leadScore: numeric('lead_score', { precision: 5, scale: 2 }),
    leadQuality: text('lead_quality'),
    scoredCategories: integer('scored_categories'),
    totalCategories: integer('total_categories'),
    primaryGap: text('primary_gap'),
    compliance: text('compliance'),

    // ─── Ekstraksiya ───
    clientExtracted: jsonb('client_extracted'),
    deal: jsonb('deal'),
    signals: jsonb('signals'),
    questionnaireAnswers: jsonb('questionnaire_answers'),

    // ─── Audio metrikalari (LLM'siz, signal ishlov berish) ───
    /** Talk ratio **audio vaqti bo'yicha** hisoblanadi, so'z soni bo'yicha emas. */
    dynamics: jsonb('dynamics'),
    voiceAnalysis: jsonb('voice_analysis'),
    audioQuality: jsonb('audio_quality'),

    // ─── Kouching ───
    summary: text('summary'),
    managerNote: jsonb('manager_note'),

    // ─── Xarajat kuzatuvi (FR-89) ───
    costUsd: numeric('cost_usd', { precision: 10, scale: 6 }),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    sttSeconds: numeric('stt_seconds', { precision: 10, scale: 2 }),
    processingMs: integer('processing_ms'),

    isFlagged: boolean('is_flagged').notNull().default(false),
    flaggedReason: text('flagged_reason'),

    analyzedAt: timestamp('analyzed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('analysis_conversation_uq').on(t.conversationId),
    index('analysis_business_idx').on(t.businessId, t.analyzedAt),
    index('analysis_seat_idx').on(t.businessId, t.seatId, t.analyzedAt),
  ],
);

/**
 * Har bir mezon uchun alohida qator — analitika shu jadval ustida ishlaydi
 * (jsonb ichida qidirishdan ancha tez).
 *
 * ═══ FR-80/82: ISBOTLI BAHOLASH ═══
 * `score` qo'yilgan bo'lsa, `evidenceQuote` **majburiy** — buni DB darajasidagi
 * CHECK cheklovi kafolatlaydi. Ya'ni ilova kodida xato bo'lsa ham isbotsiz
 * ball yozib bo'lmaydi. Model iqtibos keltira olmasa `score = NULL`
 * ("aniqlanmadi") bo'ladi.
 *
 * Bu mahsulotning asosiy farqi va u shunchaki kelishuv emas,
 * strukturaviy kafolat.
 */
export const criterionScore = pgTable(
  'criterion_score',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    analysisId: uuid('analysis_id')
      .notNull()
      .references(() => analysis.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversation.id, { onDelete: 'cascade' }),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    seatId: uuid('seat_id').references(() => seat.id, { onDelete: 'set null' }),

    criterionCode: text('criterion_code').notNull(), // A1, B2...
    criterionName: text('criterion_name').notNull(),
    categoryCode: text('category_code'),
    categoryWeightPct: numeric('category_weight_pct', { precision: 5, scale: 2 }),

    /**
     * Baholangan paytdagi rubrika nusxasi ({ "0": "...", ..., "3": "..." }).
     * Playbook keyin o'zgarsa ham bu baho o'z kontekstini yo'qotmaydi.
     */
    rubricSnapshot: jsonb('rubric_snapshot').notNull(),

    /** NULL = "aniqlanmadi" (isbot topilmadi). 0..3 = baholandi. */
    score: integer('score'),
    maxScore: integer('max_score').notNull().default(3),
    isWeakArea: boolean('is_weak_area').notNull().default(false),

    // ─── Isbot (score NULL bo'lmasa majburiy) ───
    evidenceQuote: text('evidence_quote'),
    evidenceStartSeconds: numeric('evidence_start_seconds', { precision: 8, scale: 2 }),
    evidenceSegmentId: bigint('evidence_segment_id', { mode: 'bigint' }).references(
      () => transcriptSegment.id,
      { onDelete: 'set null' },
    ),

    confidence: numeric('confidence', { precision: 4, scale: 3 }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('criterion_score_uq').on(t.analysisId, t.criterionCode),
    index('criterion_score_analytics_idx').on(
      t.businessId,
      t.seatId,
      t.criterionCode,
      t.createdAt,
    ),
    // ═══ Isbotsiz ball yozib bo'lmaydi ═══
    check(
      'criterion_score_requires_evidence',
      sql`${t.score} IS NULL OR ${t.evidenceQuote} IS NOT NULL`,
    ),
    check('criterion_score_range', sql`${t.score} IS NULL OR (${t.score} >= 0 AND ${t.score} <= ${t.maxScore})`),
  ],
);

/**
 * FR-124: bahoga e'tiroz.
 *
 * Bu funksiya "qo'shimcha" emas — sotuvchi noto'g'ri
 * bahoga e'tiroz bildira olmasa, tizimga ishonch yo'qoladi va u sabotajga
 * o'tadi. Qabul qilingan e'tirozlar AI ni kalibrlash uchun ma'lumot beradi.
 */
export const scoreAppeal = pgTable(
  'score_appeal',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    criterionScoreId: bigint('criterion_score_id', { mode: 'bigint' })
      .notNull()
      .references(() => criterionScore.id, { onDelete: 'cascade' }),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversation.id, { onDelete: 'cascade' }),

    raisedBy: uuid('raised_by').references(() => appUser.id, { onDelete: 'set null' }),
    reason: text('reason').notNull(),

    status: appealStatus('status').notNull().default('open'),
    originalScore: integer('original_score'),
    newScore: integer('new_score'),

    resolvedBy: uuid('resolved_by').references(() => appUser.id, { onDelete: 'set null' }),
    resolutionNote: text('resolution_note'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [
    index('score_appeal_business_status_idx').on(t.businessId, t.status, t.createdAt),
  ],
);

/**
 * FR-123: rahbardan sotuvchiga qo'lda izoh.
 *
 * AI kouchingi umumlashtiradi — u playbook mezonlari doirasida gapiradi.
 * Rahbar esa kontekstni biladi: "bu mijoz bilan o'tgan safar ham shunday
 * bo'lgan", "narxni ayta olmasliging sabab bilimda emas, ishonchda".
 * Shu ikkisi bir-birini almashtirmaydi.
 *
 * `criterionCode` ixtiyoriy: izoh butun suhbatga yoki aniq bir mezonga
 * qaratilgan bo'lishi mumkin. Mezonga bog'langanda sotuvchi uni aynan
 * o'sha bahoning yonida ko'radi — "nega 1 ball?" savoliga javob
 * shu yerda turadi.
 *
 * `seenAt` — sotuvchi izohni ochdimi. Kouching o'qilmasa, u bo'lmagani
 * bilan barobar; rahbar buni ko'rib turishi kerak.
 */
export const conversationComment = pgTable(
  'conversation_comment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversation.id, { onDelete: 'cascade' }),
    /** Izoh kimga — odatda suhbat sotuvchisi. */
    seatId: uuid('seat_id').references(() => seat.id, { onDelete: 'set null' }),
    authorId: uuid('author_id').references(() => appUser.id, { onDelete: 'set null' }),

    body: text('body').notNull(),
    /** Ixtiyoriy: aniq mezonga bog'langan izoh. */
    criterionCode: text('criterion_code'),

    seenAt: timestamp('seen_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('conversation_comment_conv_idx').on(t.conversationId, t.createdAt),
    index('conversation_comment_seat_idx').on(t.seatId, t.seenAt),
  ],
);
