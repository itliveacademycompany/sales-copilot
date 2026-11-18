-- Meta Lead Ads: har kompaniyaning O'Z Meta ilovasi (SaaS) — App ID, shifrlangan
-- App Secret, Login for Business konfiguratsiyasi va webhook verify token.
-- Idempotent. RLS — rls.sql da.
CREATE TABLE IF NOT EXISTS "meta_app_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"app_id" text,
	"app_name" text,
	"app_secret_encrypted" bytea,
	"secret_hint" text,
	"login_config_id" text,
	"verify_token" text NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "meta_app_config" ADD CONSTRAINT "meta_app_config_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "meta_app_config" ADD CONSTRAINT "meta_app_config_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "meta_app_config_business_uq" ON "meta_app_config" USING btree ("business_id");
