CREATE TYPE "public"."provider_kind" AS ENUM('anthropic', 'openai', 'google', 'deepgram', 'custom');--> statement-breakpoint
CREATE TYPE "public"."provider_purpose" AS ENUM('llm', 'stt');--> statement-breakpoint
CREATE TABLE "ai_provider" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purpose" "provider_purpose" NOT NULL,
	"kind" "provider_kind" NOT NULL,
	"label" text NOT NULL,
	"api_key_encrypted" "bytea",
	"api_key_hint" text,
	"api_key_rotated_at" timestamp with time zone,
	"models" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"base_url" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"last_check_at" timestamp with time zone,
	"last_check_ok" boolean,
	"last_check_error" text,
	"monthly_budget_usd" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"description" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_provider" ADD CONSTRAINT "ai_provider_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_setting" ADD CONSTRAINT "platform_setting_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_provider_one_active_uq" ON "ai_provider" USING btree ("purpose") WHERE "ai_provider"."is_active";--> statement-breakpoint
CREATE INDEX "ai_provider_purpose_idx" ON "ai_provider" USING btree ("purpose");