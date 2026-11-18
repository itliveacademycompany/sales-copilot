-- Meta Lead Ads: "Facebook orqali ulash" (OAuth) — sessiya, sahifa ulanishi,
-- leadgen hodisalari navbati. Idempotent — qayta qo'llansa ham xato bermaydi.
-- RLS siyosatlari rls.sql da (migratsiyadan keyin avtomatik qo'llanadi).
CREATE TABLE IF NOT EXISTS "meta_oauth_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"state_hash" text NOT NULL,
	"return_origin" text NOT NULL,
	"connection_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"selection_expires_at" timestamp with time zone,
	"fb_user_id" text,
	"pages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pages_encrypted" bytea,
	"granted_scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"user_token_expires_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meta_page_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"page_id" text NOT NULL,
	"page_name" text,
	"status" text DEFAULT 'active' NOT NULL,
	"forms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pipeline_id" uuid,
	"page_token_encrypted" bytea,
	"token_expires_at" timestamp with time zone,
	"fb_user_id" text,
	"granted_scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subscription_status" text DEFAULT 'unknown' NOT NULL,
	"subscription_checked_at" timestamp with time zone,
	"connected_by" uuid,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_event_at" timestamp with time zone,
	"first_lead_at" timestamp with time zone,
	"last_lead_at" timestamp with time zone,
	"last_error_code" text,
	"last_error" text,
	"last_error_at" timestamp with time zone,
	"last_check_at" timestamp with time zone,
	"last_check" jsonb,
	"disconnected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meta_leadgen_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"page_id" text NOT NULL,
	"leadgen_id" text NOT NULL,
	"form_id" text,
	"ad_id" text,
	"adgroup_id" text,
	"meta_created_at" timestamp with time zone,
	"status" text DEFAULT 'queued' NOT NULL,
	"reason" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 6 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"last_error" text,
	"inbox_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "meta_oauth_session" ADD CONSTRAINT "meta_oauth_session_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "meta_oauth_session" ADD CONSTRAINT "meta_oauth_session_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "meta_page_connection" ADD CONSTRAINT "meta_page_connection_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "meta_page_connection" ADD CONSTRAINT "meta_page_connection_pipeline_id_crm_pipeline_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."crm_pipeline"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "meta_page_connection" ADD CONSTRAINT "meta_page_connection_connected_by_app_user_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "meta_leadgen_event" ADD CONSTRAINT "meta_leadgen_event_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "meta_leadgen_event" ADD CONSTRAINT "meta_leadgen_event_connection_id_meta_page_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."meta_page_connection"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "meta_leadgen_event" ADD CONSTRAINT "meta_leadgen_event_inbox_id_crm_inbox_id_fk" FOREIGN KEY ("inbox_id") REFERENCES "public"."crm_inbox"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "meta_oauth_session_state_uq" ON "meta_oauth_session" USING btree ("state_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meta_oauth_session_business_idx" ON "meta_oauth_session" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "meta_page_connection_business_page_uq" ON "meta_page_connection" USING btree ("business_id","page_id");--> statement-breakpoint
-- Bitta sahifa bir vaqtda faqat bitta tashkilotga faol ulanadi (RLS'dan qat'i nazar — indeks darajasida).
CREATE UNIQUE INDEX IF NOT EXISTS "meta_page_connection_active_page_uq" ON "meta_page_connection" USING btree ("page_id") WHERE "status" <> 'disconnected';--> statement-breakpoint
-- Idempotentlik: bitta leadgen_id — bitta hodisa (Meta qayta yoki parallel yuborsa ham).
CREATE UNIQUE INDEX IF NOT EXISTS "meta_leadgen_event_lead_uq" ON "meta_leadgen_event" USING btree ("business_id","leadgen_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meta_leadgen_event_claim_idx" ON "meta_leadgen_event" USING btree ("status","run_after");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meta_leadgen_event_connection_idx" ON "meta_leadgen_event" USING btree ("connection_id","received_at");
