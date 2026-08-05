CREATE TYPE "public"."activation_status" AS ENUM('pending', 'active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."alert_kind" AS ENUM('red_flag', 'quality_drop', 'missed_lead', 'broken_commitment', 'sync_error', 'low_confidence');--> statement-breakpoint
CREATE TYPE "public"."alert_severity" AS ENUM('info', 'warning', 'critical');--> statement-breakpoint
CREATE TYPE "public"."alert_status" AS ENUM('new', 'seen', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."appeal_status" AS ENUM('open', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('phone', 'telegram', 'meeting', 'whatsapp', 'instagram');--> statement-breakpoint
CREATE TYPE "public"."commitment_party" AS ENUM('manager', 'client');--> statement-breakpoint
CREATE TYPE "public"."commitment_status" AS ENUM('pending', 'done', 'missed');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('received', 'filtered', 'queued', 'transcribing', 'analyzing', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."direction" AS ENUM('inbound', 'outbound', 'na');--> statement-breakpoint
CREATE TYPE "public"."integration_kind" AS ENUM('amocrm', 'bitrix24', 'telegram_bot', 'telegram_user', 'moizvonki', 'binotel', 'freepbx', 'generic_webhook');--> statement-breakpoint
CREATE TYPE "public"."integration_status" AS ENUM('disconnected', 'connected', 'error');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'supervisor', 'head', 'auditor');--> statement-breakpoint
CREATE TYPE "public"."speaker" AS ENUM('manager', 'client', 'unknown', 'system');--> statement-breakpoint
CREATE TYPE "public"."speaker_attribution_method" AS ENUM('channel', 'phone', 'telegram_id', 'llm_inferred');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trial', 'active', 'past_due', 'grace', 'degraded', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."sync_direction" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TYPE "public"."system_role" AS ENUM('super_admin', 'business_owner', 'partner', 'user');--> statement-breakpoint
CREATE TYPE "public"."task_source" AS ENUM('playbook_analysis', 'other_analysis', 'manual');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pending', 'in_progress', 'done', 'cancelled', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('topup', 'charge', 'refund', 'bonus', 'partner_commission');--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"login" text,
	"password_hash" text,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"locale" text DEFAULT 'uz' NOT NULL,
	"system_role" "system_role" DEFAULT 'user' NOT NULL,
	"telegram_id" text,
	"telegram_username" text,
	"email_verified_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "business" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"logo_url" text,
	"timezone" text DEFAULT 'Asia/Tashkent' NOT NULL,
	"currency" text DEFAULT 'UZS' NOT NULL,
	"locale" text DEFAULT 'uz' NOT NULL,
	"profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"onboarding_step" text DEFAULT 'profile' NOT NULL,
	"onboarding_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "business_member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" NOT NULL,
	"department_id" uuid,
	"invited_via" text,
	"invited_login" text,
	"activation" "activation_status" DEFAULT 'pending' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "department" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"head_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"user_id" uuid,
	"department_id" uuid,
	"display_name" text NOT NULL,
	"login" text,
	"phone_numbers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"telegram_id" text,
	"external_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"activation_token" text,
	"activation" "activation_status" DEFAULT 'pending' NOT NULL,
	"telegram_linked" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_occupied" boolean DEFAULT false NOT NULL,
	"total_conversations" integer DEFAULT 0 NOT NULL,
	"avg_score" numeric(5, 2),
	"last_conversation_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"previous_session_id" uuid,
	"user_agent" text,
	"ip" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_schedule" (
	"business_id" uuid PRIMARY KEY NOT NULL,
	"timezone" text DEFAULT 'Asia/Tashkent' NOT NULL,
	"days" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"holidays" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playbook" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"criteria" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"questionnaire" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"classification_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"prompt_notes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"lead_quality" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"business_profile_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"origin" text DEFAULT 'manual' NOT NULL,
	"change_note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "playbook_simulation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"draft_criteria" jsonb NOT NULL,
	"base_playbook_id" uuid,
	"sample_size" integer NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"result" jsonb,
	"cost_usd" jsonb,
	"error" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "playbook_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"industry" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"locale" text DEFAULT 'uz' NOT NULL,
	"content" jsonb NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analysis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"seat_id" uuid,
	"playbook_id" uuid,
	"playbook_version" integer,
	"model_versions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"speaker_attribution_method" "speaker_attribution_method",
	"speaker_attribution_confidence" numeric(4, 3),
	"business_relevance" text,
	"call_family" text,
	"service_line" text,
	"classification_confidence" numeric(4, 3),
	"scoring_mode" text,
	"overall_score" numeric(5, 2),
	"lead_score" numeric(5, 2),
	"lead_quality" text,
	"scored_categories" integer,
	"total_categories" integer,
	"primary_gap" text,
	"compliance" text,
	"client_extracted" jsonb,
	"deal" jsonb,
	"signals" jsonb,
	"questionnaire_answers" jsonb,
	"dynamics" jsonb,
	"voice_analysis" jsonb,
	"audio_quality" jsonb,
	"summary" text,
	"manager_note" jsonb,
	"cost_usd" numeric(10, 6),
	"tokens_in" integer,
	"tokens_out" integer,
	"stt_seconds" numeric(10, 2),
	"processing_ms" integer,
	"is_flagged" boolean DEFAULT false NOT NULL,
	"flagged_reason" text,
	"analyzed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text,
	"phone" text,
	"telegram_id" text,
	"company" text,
	"role" text,
	"is_decision_maker" boolean,
	"crm_contact_id" text,
	"crm_lead_id" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"seat_id" uuid,
	"contact_id" uuid,
	"channel" "channel" NOT NULL,
	"direction" "direction" DEFAULT 'na' NOT NULL,
	"external_id" text,
	"external_source" text,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_seconds" integer,
	"media_url" text,
	"media_filename" text,
	"media_kind" text,
	"media_bytes" integer,
	"media_channels" integer,
	"recording_start_mode" text,
	"beep_start_seconds" numeric(8, 2),
	"beep_end_seconds" numeric(8, 2),
	"analysis_start_seconds" numeric(8, 2),
	"phone_from" text,
	"phone_to" text,
	"crm_lead_id" text,
	"crm_contact_id" text,
	"crm_call_id" text,
	"status" "conversation_status" DEFAULT 'received' NOT NULL,
	"excluded_reason" text,
	"is_off_hours" boolean DEFAULT false NOT NULL,
	"language" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "criterion_score" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"analysis_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"seat_id" uuid,
	"criterion_code" text NOT NULL,
	"criterion_name" text NOT NULL,
	"category_code" text,
	"category_weight_pct" numeric(5, 2),
	"rubric_snapshot" jsonb NOT NULL,
	"score" integer,
	"max_score" integer DEFAULT 3 NOT NULL,
	"is_weak_area" boolean DEFAULT false NOT NULL,
	"evidence_quote" text,
	"evidence_start_seconds" numeric(8, 2),
	"evidence_segment_id" bigint,
	"confidence" numeric(4, 3),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "criterion_score_requires_evidence" CHECK ("criterion_score"."score" IS NULL OR "criterion_score"."evidence_quote" IS NOT NULL),
	CONSTRAINT "criterion_score_range" CHECK ("criterion_score"."score" IS NULL OR ("criterion_score"."score" >= 0 AND "criterion_score"."score" <= "criterion_score"."max_score"))
);
--> statement-breakpoint
CREATE TABLE "score_appeal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criterion_score_id" bigint NOT NULL,
	"business_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"raised_by" uuid,
	"reason" text NOT NULL,
	"status" "appeal_status" DEFAULT 'open' NOT NULL,
	"original_score" integer,
	"new_score" integer,
	"resolved_by" uuid,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "transcript_segment" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"speaker" "speaker" NOT NULL,
	"text" text NOT NULL,
	"start_seconds" numeric(8, 2) NOT NULL,
	"end_seconds" numeric(8, 2),
	"confidence" numeric(4, 3),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commitment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"seat_id" uuid,
	"by_party" "commitment_party" NOT NULL,
	"what" text NOT NULL,
	"deadline" timestamp with time zone,
	"status" "commitment_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"seat_id" uuid,
	"conversation_id" uuid,
	"commitment_id" uuid,
	"source" "task_source" DEFAULT 'manual' NOT NULL,
	"action" text,
	"title" text NOT NULL,
	"description" text,
	"status" "task_status" DEFAULT 'pending' NOT NULL,
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"crm_stage_id" text,
	"crm_stage_name" text,
	"crm_task_id" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"kind" "integration_kind" NOT NULL,
	"status" "integration_status" DEFAULT 'disconnected' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"credentials_encrypted" "bytea",
	"token_expires_at" timestamp with time zone,
	"webhook_secret" text,
	"sync_enabled" boolean DEFAULT true NOT NULL,
	"poll_interval_minutes" integer DEFAULT 15 NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_sync_status" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"integration_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"direction" "sync_direction" NOT NULL,
	"entity" text NOT NULL,
	"status" text NOT NULL,
	"item_count" integer,
	"payload_hash" text,
	"error" text,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_transaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"type" "transaction_type" NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"balance_before" numeric(14, 2) NOT NULL,
	"balance_after" numeric(14, 2) NOT NULL,
	"currency" text DEFAULT 'UZS' NOT NULL,
	"description" text,
	"seats_count" integer,
	"seat_price" numeric(14, 2),
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"partner_commission" numeric(14, 2),
	"payment_provider" text,
	"payment_id" text,
	"performed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"business_id" uuid PRIMARY KEY NOT NULL,
	"status" "subscription_status" DEFAULT 'trial' NOT NULL,
	"plan" text DEFAULT 'business' NOT NULL,
	"seat_price" numeric(14, 2) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'UZS' NOT NULL,
	"balance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"billing_day" integer DEFAULT 1 NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"grace_ends_at" timestamp with time zone,
	"data_retention_until" timestamp with time zone,
	"auto_charge" boolean DEFAULT false NOT NULL,
	"saved_card_token" text,
	"payment_provider" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_record" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"conversation_id" uuid,
	"stage" text NOT NULL,
	"provider" text,
	"model" text,
	"stt_seconds" numeric(10, 2),
	"tokens_in" integer,
	"tokens_out" integer,
	"cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"seat_id" uuid,
	"conversation_id" uuid,
	"kind" "alert_kind" NOT NULL,
	"severity" "alert_severity" DEFAULT 'warning' NOT NULL,
	"status" "alert_status" DEFAULT 'new' NOT NULL,
	"title" text NOT NULL,
	"body" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"business_id" uuid,
	"actor_id" uuid,
	"impersonator_id" uuid,
	"action" text NOT NULL,
	"entity" text,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_summary" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"seat_id" uuid,
	"summary_date" text NOT NULL,
	"content" text,
	"highlights" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"triggered_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboard_layout" (
	"business_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"sections" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"order" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dashboard_layout_business_id_user_id_pk" PRIMARY KEY("business_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "business_member" ADD CONSTRAINT "business_member_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_member" ADD CONSTRAINT "business_member_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_member" ADD CONSTRAINT "business_member_department_id_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."department"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department" ADD CONSTRAINT "department_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat" ADD CONSTRAINT "seat_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat" ADD CONSTRAINT "seat_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat" ADD CONSTRAINT "seat_department_id_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."department"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_schedule" ADD CONSTRAINT "work_schedule_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook" ADD CONSTRAINT "playbook_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook" ADD CONSTRAINT "playbook_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_simulation" ADD CONSTRAINT "playbook_simulation_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_simulation" ADD CONSTRAINT "playbook_simulation_base_playbook_id_playbook_id_fk" FOREIGN KEY ("base_playbook_id") REFERENCES "public"."playbook"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_simulation" ADD CONSTRAINT "playbook_simulation_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis" ADD CONSTRAINT "analysis_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis" ADD CONSTRAINT "analysis_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis" ADD CONSTRAINT "analysis_seat_id_seat_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."seat"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis" ADD CONSTRAINT "analysis_playbook_id_playbook_id_fk" FOREIGN KEY ("playbook_id") REFERENCES "public"."playbook"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_seat_id_seat_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."seat"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "criterion_score" ADD CONSTRAINT "criterion_score_analysis_id_analysis_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analysis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "criterion_score" ADD CONSTRAINT "criterion_score_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "criterion_score" ADD CONSTRAINT "criterion_score_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "criterion_score" ADD CONSTRAINT "criterion_score_seat_id_seat_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."seat"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "criterion_score" ADD CONSTRAINT "criterion_score_evidence_segment_id_transcript_segment_id_fk" FOREIGN KEY ("evidence_segment_id") REFERENCES "public"."transcript_segment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_appeal" ADD CONSTRAINT "score_appeal_criterion_score_id_criterion_score_id_fk" FOREIGN KEY ("criterion_score_id") REFERENCES "public"."criterion_score"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_appeal" ADD CONSTRAINT "score_appeal_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_appeal" ADD CONSTRAINT "score_appeal_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_appeal" ADD CONSTRAINT "score_appeal_raised_by_app_user_id_fk" FOREIGN KEY ("raised_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_appeal" ADD CONSTRAINT "score_appeal_resolved_by_app_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_segment" ADD CONSTRAINT "transcript_segment_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_segment" ADD CONSTRAINT "transcript_segment_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment" ADD CONSTRAINT "commitment_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment" ADD CONSTRAINT "commitment_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment" ADD CONSTRAINT "commitment_seat_id_seat_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."seat"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_seat_id_seat_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."seat"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_commitment_id_commitment_id_fk" FOREIGN KEY ("commitment_id") REFERENCES "public"."commitment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration" ADD CONSTRAINT "integration_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_log" ADD CONSTRAINT "sync_log_integration_id_integration_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integration"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_log" ADD CONSTRAINT "sync_log_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_transaction" ADD CONSTRAINT "billing_transaction_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_transaction" ADD CONSTRAINT "billing_transaction_performed_by_app_user_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_record" ADD CONSTRAINT "usage_record_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_record" ADD CONSTRAINT "usage_record_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_seat_id_seat_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."seat"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_resolved_by_app_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_app_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_impersonator_id_app_user_id_fk" FOREIGN KEY ("impersonator_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_summary" ADD CONSTRAINT "daily_summary_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_summary" ADD CONSTRAINT "daily_summary_seat_id_seat_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."seat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_layout" ADD CONSTRAINT "dashboard_layout_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_layout" ADD CONSTRAINT "dashboard_layout_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_user_email_uq" ON "app_user" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "app_user_login_uq" ON "app_user" USING btree ("login");--> statement-breakpoint
CREATE UNIQUE INDEX "app_user_telegram_uq" ON "app_user" USING btree ("telegram_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_slug_uq" ON "business" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "business_member_uq" ON "business_member" USING btree ("business_id","user_id");--> statement-breakpoint
CREATE INDEX "business_member_business_idx" ON "business_member" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "department_business_idx" ON "department" USING btree ("business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seat_login_uq" ON "seat" USING btree ("business_id","login");--> statement-breakpoint
CREATE INDEX "seat_business_idx" ON "seat" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "seat_user_idx" ON "seat" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_refresh_uq" ON "session" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "playbook_version_uq" ON "playbook" USING btree ("business_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "playbook_one_active_uq" ON "playbook" USING btree ("business_id") WHERE "playbook"."is_active";--> statement-breakpoint
CREATE INDEX "playbook_business_idx" ON "playbook" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "playbook_simulation_business_idx" ON "playbook_simulation" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "playbook_template_industry_idx" ON "playbook_template" USING btree ("industry");--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_conversation_uq" ON "analysis" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "analysis_business_idx" ON "analysis" USING btree ("business_id","analyzed_at");--> statement-breakpoint
CREATE INDEX "analysis_seat_idx" ON "analysis" USING btree ("business_id","seat_id","analyzed_at");--> statement-breakpoint
CREATE INDEX "contact_business_phone_idx" ON "contact" USING btree ("business_id","phone");--> statement-breakpoint
CREATE INDEX "contact_business_crm_idx" ON "contact" USING btree ("business_id","crm_contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_external_uq" ON "conversation" USING btree ("business_id","channel","external_id");--> statement-breakpoint
CREATE INDEX "conversation_business_started_idx" ON "conversation" USING btree ("business_id","started_at");--> statement-breakpoint
CREATE INDEX "conversation_seat_idx" ON "conversation" USING btree ("business_id","seat_id","started_at");--> statement-breakpoint
CREATE INDEX "conversation_status_idx" ON "conversation" USING btree ("business_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "criterion_score_uq" ON "criterion_score" USING btree ("analysis_id","criterion_code");--> statement-breakpoint
CREATE INDEX "criterion_score_analytics_idx" ON "criterion_score" USING btree ("business_id","seat_id","criterion_code","created_at");--> statement-breakpoint
CREATE INDEX "score_appeal_business_status_idx" ON "score_appeal" USING btree ("business_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "transcript_segment_seq_uq" ON "transcript_segment" USING btree ("conversation_id","seq");--> statement-breakpoint
CREATE INDEX "transcript_segment_conv_idx" ON "transcript_segment" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "commitment_deadline_idx" ON "commitment" USING btree ("business_id","status","deadline");--> statement-breakpoint
CREATE INDEX "commitment_seat_idx" ON "commitment" USING btree ("business_id","seat_id");--> statement-breakpoint
CREATE INDEX "task_seat_due_idx" ON "task" USING btree ("business_id","seat_id","status","due_at");--> statement-breakpoint
CREATE INDEX "task_business_status_idx" ON "task" USING btree ("business_id","status");--> statement-breakpoint
CREATE INDEX "task_conversation_idx" ON "task" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_business_kind_uq" ON "integration" USING btree ("business_id","kind");--> statement-breakpoint
CREATE INDEX "integration_business_idx" ON "integration" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "sync_log_integration_idx" ON "sync_log" USING btree ("integration_id","created_at");--> statement-breakpoint
CREATE INDEX "billing_transaction_business_idx" ON "billing_transaction" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "usage_record_business_idx" ON "usage_record" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "alert_business_status_idx" ON "alert" USING btree ("business_id","status","created_at");--> statement-breakpoint
CREATE INDEX "alert_dedupe_idx" ON "alert" USING btree ("business_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "audit_log_business_idx" ON "audit_log" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "daily_summary_business_date_idx" ON "daily_summary" USING btree ("business_id","summary_date");