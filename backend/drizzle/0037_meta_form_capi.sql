-- amoCRM ↔ Meta tengligi: (1) har Instant Form uchun voronka, maydonlar xaritasi,
-- teg, manba va avto-taqsimot; (2) Meta Conversions API — bitim bosqichi natijasini
-- Meta'ga qaytarish (qoida + navbat/jurnal). Idempotent. RLS — rls.sql da.
CREATE TABLE IF NOT EXISTS "meta_form_setting" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL REFERENCES "business"("id") ON DELETE cascade,
	"form_id" text NOT NULL,
	"form_name" text,
	"page_name" text,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pipeline_id" uuid REFERENCES "crm_pipeline"("id") ON DELETE set null,
	"stage_id" uuid,
	"mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"source_name" text,
	"auto_accept" integer DEFAULT 0 NOT NULL,
	"seat_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rr_cursor" integer DEFAULT -1 NOT NULL,
	"lead_count" integer DEFAULT 0 NOT NULL,
	"last_lead_at" timestamp with time zone,
	"updated_by" uuid REFERENCES "app_user"("id") ON DELETE set null,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "meta_form_setting_form_uq" ON "meta_form_setting" ("business_id","form_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meta_capi_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL REFERENCES "business"("id") ON DELETE cascade,
	"dataset_id" text NOT NULL,
	"dataset_name" text,
	"token_encrypted" bytea NOT NULL,
	"token_hint" text NOT NULL,
	"test_event_code" text,
	"enabled" integer DEFAULT 1 NOT NULL,
	"last_check_at" timestamp with time zone,
	"last_check_ok" integer,
	"last_error" text,
	"updated_by" uuid REFERENCES "app_user"("id") ON DELETE set null,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "meta_capi_config_business_uq" ON "meta_capi_config" ("business_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meta_capi_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL REFERENCES "business"("id") ON DELETE cascade,
	"pipeline_id" uuid NOT NULL REFERENCES "crm_pipeline"("id") ON DELETE cascade,
	"stage_id" uuid NOT NULL,
	"event_name" text NOT NULL,
	"send_value" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'UZS' NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"created_by" uuid REFERENCES "app_user"("id") ON DELETE set null,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "meta_capi_rule_stage_event_uq" ON "meta_capi_rule" ("business_id","stage_id","event_name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meta_capi_rule_active_idx" ON "meta_capi_rule" ("business_id","active");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meta_capi_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL REFERENCES "business"("id") ON DELETE cascade,
	"rule_id" uuid REFERENCES "meta_capi_rule"("id") ON DELETE set null,
	"deal_id" uuid NOT NULL,
	"deal_event_id" uuid NOT NULL,
	"event_name" text NOT NULL,
	"event_id" text NOT NULL,
	"event_time" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"reason" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"match_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"events_received" integer,
	"fbtrace_id" text,
	"test_mode" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "meta_capi_event_rule_deal_event_uq" ON "meta_capi_event" ("rule_id","deal_event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meta_capi_event_claim_idx" ON "meta_capi_event" ("status","run_after");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meta_capi_event_business_idx" ON "meta_capi_event" ("business_id","created_at");
--> statement-breakpoint
ALTER TABLE "meta_form_setting" ADD COLUMN IF NOT EXISTS "rr_cursor" integer DEFAULT -1 NOT NULL;
--> statement-breakpoint
-- CAPI navbati bosqich hodisalarini biznes va vaqt bo'yicha qidiradi; mavjud indeks faqat deal_id bo'yicha.
CREATE INDEX IF NOT EXISTS "deal_event_stage_recent_idx" ON "deal_event" ("business_id","created_at") WHERE "type" IN ('stage','created');
