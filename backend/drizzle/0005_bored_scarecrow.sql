CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'done', 'failed', 'dead');--> statement-breakpoint
CREATE TABLE "analysis_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"kind" text DEFAULT 'analyze' NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "prompt_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"version" integer NOT NULL,
	"content" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"change_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analysis_job" ADD CONSTRAINT "analysis_job_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_job" ADD CONSTRAINT "analysis_job_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_job_active_uq" ON "analysis_job" USING btree ("conversation_id") WHERE "analysis_job"."status" in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "analysis_job_claim_idx" ON "analysis_job" USING btree ("status","run_after","created_at");--> statement-breakpoint
CREATE INDEX "analysis_job_business_idx" ON "analysis_job" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_template_version_uq" ON "prompt_template" USING btree ("key","version");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_template_one_active_uq" ON "prompt_template" USING btree ("key") WHERE "prompt_template"."is_active";--> statement-breakpoint
CREATE INDEX "prompt_template_key_idx" ON "prompt_template" USING btree ("key");