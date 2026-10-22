CREATE TYPE "public"."crm_stage_kind" AS ENUM('open', 'won', 'lost');--> statement-breakpoint
CREATE TABLE "crm_field" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"type" text NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"group_name" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_pipeline" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"is_main" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_stage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#8ab4f8' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"kind" "crm_stage_kind" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"name" text NOT NULL,
	"amount" numeric(14, 2),
	"responsible_seat_id" uuid,
	"contact_id" uuid,
	"fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" text,
	"lost_reason" text,
	"stage_entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "deal_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"type" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"author_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "deal_id" uuid;--> statement-breakpoint
ALTER TABLE "crm_field" ADD CONSTRAINT "crm_field_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_pipeline" ADD CONSTRAINT "crm_pipeline_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_stage" ADD CONSTRAINT "crm_stage_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_stage" ADD CONSTRAINT "crm_stage_pipeline_id_crm_pipeline_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."crm_pipeline"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_pipeline_id_crm_pipeline_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."crm_pipeline"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_stage_id_crm_stage_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."crm_stage"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_responsible_seat_id_seat_id_fk" FOREIGN KEY ("responsible_seat_id") REFERENCES "public"."seat"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_event" ADD CONSTRAINT "deal_event_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_event" ADD CONSTRAINT "deal_event_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_event" ADD CONSTRAINT "deal_event_author_user_id_app_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_field_code_uq" ON "crm_field" USING btree ("business_id","code");--> statement-breakpoint
CREATE INDEX "crm_pipeline_business_idx" ON "crm_pipeline" USING btree ("business_id","sort");--> statement-breakpoint
CREATE INDEX "crm_stage_pipeline_idx" ON "crm_stage" USING btree ("pipeline_id","sort");--> statement-breakpoint
CREATE INDEX "deal_board_idx" ON "deal" USING btree ("business_id","pipeline_id","stage_id","stage_entered_at");--> statement-breakpoint
CREATE INDEX "deal_contact_idx" ON "deal" USING btree ("business_id","contact_id");--> statement-breakpoint
CREATE INDEX "deal_responsible_idx" ON "deal" USING btree ("business_id","responsible_seat_id");--> statement-breakpoint
CREATE INDEX "deal_updated_idx" ON "deal" USING btree ("business_id","updated_at");--> statement-breakpoint
CREATE INDEX "deal_event_deal_idx" ON "deal_event" USING btree ("deal_id","created_at");--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_deal_idx" ON "task" USING btree ("business_id","deal_id");