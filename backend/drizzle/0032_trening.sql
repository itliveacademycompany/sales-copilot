-- ═══════════════════════════════════════════════════════════════════════════
-- AI MIJOZ TRENAJYORI (Mijoz-AI moduli) — CRM → Simulyator
-- ═══════════════════════════════════════════════════════════════════════════
-- Manba: `backend/src/db/schema/training.ts` (modulning `integration/*.sql`
-- fayllari bilan bir xil, ssenariy ustunlari qo'shilgan holda).
-- Eski simulyator jadvallari (`simulyator_*`) tegilmaydi — tarix saqlanadi.
-- RLS: jadvallar `rls.sql` dagi `tenant_tables` ro'yxatiga qo'shilgan
-- (migratsiyadan keyin avtomatik qo'llanadi).
-- IF NOT EXISTS — qayta ishga tushsa ham xavfsiz.

CREATE TABLE IF NOT EXISTS "training_session" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "business"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "app_user"("id") ON DELETE CASCADE,
  "seat_id" uuid REFERENCES "seat"("id") ON DELETE SET NULL,
  "archetype_key" text NOT NULL,
  "persona_card" jsonb,
  "state" jsonb NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "outcome" text,
  "end_reason" text,
  "turn_count" integer DEFAULT 0 NOT NULL,
  "cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ended_at" timestamp with time zone,
  "scenario_id" text,
  "scenario" jsonb,
  "seller_profile" jsonb,
  CONSTRAINT "training_session_archetype_key_check" CHECK (archetype_key in ('ready_buyer', 'negotiator', 'problematic', 'info_seeker')),
  CONSTRAINT "training_session_status_check" CHECK (status in ('active', 'ended', 'abandoned')),
  CONSTRAINT "training_session_outcome_check" CHECK (outcome is null or outcome in ('won', 'lost', 'timeout'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "training_session_business_user_started_idx"
  ON "training_session" ("business_id", "user_id", "started_at" DESC);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "training_scenario" (
  "business_id" uuid NOT NULL REFERENCES "business"("id") ON DELETE CASCADE,
  "id" text NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "title" text NOT NULL,
  "difficulty" smallint NOT NULL,
  "insult_level" smallint NOT NULL,
  "data" jsonb NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "training_scenario_pkey" PRIMARY KEY ("business_id", "id"),
  CONSTRAINT "training_scenario_difficulty_check" CHECK (difficulty between 1 and 5),
  CONSTRAINT "training_scenario_insult_level_check" CHECK (insult_level between 0 and 2)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "training_turn" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "session_id" uuid NOT NULL REFERENCES "training_session"("id") ON DELETE CASCADE,
  "business_id" uuid NOT NULL REFERENCES "business"("id") ON DELETE CASCADE,
  "seq" integer NOT NULL,
  "speaker" text NOT NULL,
  "text" text NOT NULL,
  "state_after" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "training_turn_speaker_check" CHECK (speaker in ('seller', 'customer'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "training_turn_session_seq_key" ON "training_turn" ("session_id", "seq");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "training_result" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "business"("id") ON DELETE CASCADE,
  "session_id" uuid NOT NULL REFERENCES "training_session"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "quality" text DEFAULT 'ok' NOT NULL,
  "skill_score" numeric(5, 1),
  "criteria" jsonb,
  "metrics" jsonb,
  "coaching" jsonb,
  "key_moments" jsonb,
  "model" text,
  "prompt_version" text,
  "cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "training_result_status_check" CHECK (status in ('pending', 'done', 'failed')),
  CONSTRAINT "training_result_quality_check" CHECK (quality in ('ok', 'low', 'insufficient'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "training_result_session_version_key" ON "training_result" ("session_id", "version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "training_result_business_session_idx"
  ON "training_result" ("business_id", "session_id", "version" DESC);
