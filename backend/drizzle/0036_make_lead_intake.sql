-- Facebook Lead Ads — Make orqali qabul qilish: tenant uchun integratsiya va
-- API kaliti XESHI (kalitning o'zi saqlanmaydi). Idempotent. RLS — rls.sql da.
-- Lid takrorlanmasligi mavjud `crm_inbox_external_uq` (business_id, source,
-- external_id) unikal kaliti bilan kafolatlanadi.
CREATE TABLE IF NOT EXISTS "make_lead_intake" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"key_hash" text NOT NULL,
	"key_hint" text NOT NULL,
	"pipeline_id" uuid,
	"created_by" uuid,
	"key_rotated_at" timestamp with time zone,
	"last_request_at" timestamp with time zone,
	"last_test_at" timestamp with time zone,
	"first_lead_at" timestamp with time zone,
	"last_lead_at" timestamp with time zone,
	"lead_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"last_error_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "make_lead_intake" ADD CONSTRAINT "make_lead_intake_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "make_lead_intake" ADD CONSTRAINT "make_lead_intake_pipeline_id_crm_pipeline_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."crm_pipeline"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "make_lead_intake" ADD CONSTRAINT "make_lead_intake_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "make_lead_intake_business_uq" ON "make_lead_intake" USING btree ("business_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "make_lead_intake_key_uq" ON "make_lead_intake" USING btree ("key_hash");
