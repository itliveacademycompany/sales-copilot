CREATE TABLE "company" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"website" text,
	"address" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_automation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"name" text NOT NULL,
	"delay_minutes" integer DEFAULT 0 NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_automation_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"automation_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"entry_key" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_form" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pipeline_id" uuid,
	"source" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"thank_you" text,
	"auto_accept" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"submissions" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_goal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"seat_id" uuid,
	"month" date NOT NULL,
	"amount" numeric(14, 2),
	"count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_inbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"source" text NOT NULL,
	"external_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"name" text,
	"phone" text,
	"email" text,
	"message" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"contact_id" uuid,
	"form_id" uuid,
	"conversation_id" uuid,
	"pipeline_id" uuid,
	"deal_id" uuid,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_loss_reason" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_product" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sku" text,
	"price" numeric(14, 2) DEFAULT '0' NOT NULL,
	"description" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_saved_filter" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"filter" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_setting" (
	"business_id" uuid PRIMARY KEY NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deal_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"product_id" uuid,
	"name" text NOT NULL,
	"price" numeric(14, 2) NOT NULL,
	"quantity" numeric(12, 3) DEFAULT '1' NOT NULL,
	"discount" numeric(5, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "phones" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "emails" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "contact_id" uuid;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "task_type" text;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "result" text;--> statement-breakpoint
ALTER TABLE "deal" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "deal" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "deal" ADD COLUMN "lost_reason_id" uuid;--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_automation" ADD CONSTRAINT "crm_automation_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_automation" ADD CONSTRAINT "crm_automation_pipeline_id_crm_pipeline_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."crm_pipeline"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_automation" ADD CONSTRAINT "crm_automation_stage_id_crm_stage_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."crm_stage"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_automation_run" ADD CONSTRAINT "crm_automation_run_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_automation_run" ADD CONSTRAINT "crm_automation_run_automation_id_crm_automation_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."crm_automation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_automation_run" ADD CONSTRAINT "crm_automation_run_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_form" ADD CONSTRAINT "crm_form_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_form" ADD CONSTRAINT "crm_form_pipeline_id_crm_pipeline_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."crm_pipeline"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_goal" ADD CONSTRAINT "crm_goal_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_goal" ADD CONSTRAINT "crm_goal_seat_id_seat_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."seat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_inbox" ADD CONSTRAINT "crm_inbox_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_inbox" ADD CONSTRAINT "crm_inbox_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_inbox" ADD CONSTRAINT "crm_inbox_form_id_crm_form_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."crm_form"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_inbox" ADD CONSTRAINT "crm_inbox_pipeline_id_crm_pipeline_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."crm_pipeline"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_inbox" ADD CONSTRAINT "crm_inbox_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_inbox" ADD CONSTRAINT "crm_inbox_decided_by_app_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_loss_reason" ADD CONSTRAINT "crm_loss_reason_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_product" ADD CONSTRAINT "crm_product_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_saved_filter" ADD CONSTRAINT "crm_saved_filter_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_saved_filter" ADD CONSTRAINT "crm_saved_filter_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_setting" ADD CONSTRAINT "crm_setting_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_item" ADD CONSTRAINT "deal_item_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_item" ADD CONSTRAINT "deal_item_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_item" ADD CONSTRAINT "deal_item_product_id_crm_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."crm_product"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_business_name_idx" ON "company" USING btree ("business_id","name");--> statement-breakpoint
CREATE INDEX "crm_automation_stage_idx" ON "crm_automation" USING btree ("business_id","stage_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_automation_run_uq" ON "crm_automation_run" USING btree ("automation_id","deal_id","entry_key");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_form_slug_uq" ON "crm_form" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_goal_uq" ON "crm_goal" USING btree ("business_id","seat_id","month");--> statement-breakpoint
CREATE INDEX "crm_inbox_status_idx" ON "crm_inbox" USING btree ("business_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_inbox_external_uq" ON "crm_inbox" USING btree ("business_id","source","external_id");--> statement-breakpoint
CREATE INDEX "crm_loss_reason_business_idx" ON "crm_loss_reason" USING btree ("business_id","sort");--> statement-breakpoint
CREATE INDEX "crm_product_business_idx" ON "crm_product" USING btree ("business_id","name");--> statement-breakpoint
CREATE INDEX "crm_saved_filter_user_idx" ON "crm_saved_filter" USING btree ("business_id","user_id");--> statement-breakpoint
CREATE INDEX "deal_item_deal_idx" ON "deal_item" USING btree ("deal_id");--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_lost_reason_id_crm_loss_reason_id_fk" FOREIGN KEY ("lost_reason_id") REFERENCES "public"."crm_loss_reason"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_contact_idx" ON "task" USING btree ("business_id","contact_id");--> statement-breakpoint
CREATE INDEX "deal_tags_idx" ON "deal" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "deal_deleted_idx" ON "deal" USING btree ("business_id","deleted_at");