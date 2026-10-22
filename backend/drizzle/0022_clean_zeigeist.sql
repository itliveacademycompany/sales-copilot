CREATE TABLE "crm_lead" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"integration_id" uuid NOT NULL,
	"kind" "integration_kind" NOT NULL,
	"crm_id" text NOT NULL,
	"name" text,
	"pipeline_id" text,
	"pipeline_name" text,
	"stage_id" text,
	"stage_name" text,
	"stage_type" text DEFAULT 'ochiq' NOT NULL,
	"amount" numeric(14, 2),
	"responsible_crm_id" text,
	"responsible_name" text,
	"seat_id" uuid,
	"crm_contact_id" text,
	"contact_name" text,
	"phone" text,
	"contact_id" uuid,
	"url" text,
	"crm_created_at" timestamp with time zone,
	"crm_updated_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_lead" ADD CONSTRAINT "crm_lead_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_lead" ADD CONSTRAINT "crm_lead_integration_id_integration_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integration"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_lead" ADD CONSTRAINT "crm_lead_seat_id_seat_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."seat"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_lead" ADD CONSTRAINT "crm_lead_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_lead_uq" ON "crm_lead" USING btree ("integration_id","crm_id");--> statement-breakpoint
CREATE INDEX "crm_lead_business_updated_idx" ON "crm_lead" USING btree ("business_id","crm_updated_at");--> statement-breakpoint
CREATE INDEX "crm_lead_business_stage_idx" ON "crm_lead" USING btree ("business_id","stage_type","pipeline_id");--> statement-breakpoint
CREATE INDEX "crm_lead_contact_idx" ON "crm_lead" USING btree ("business_id","contact_id");--> statement-breakpoint
CREATE INDEX "crm_lead_seat_idx" ON "crm_lead" USING btree ("business_id","seat_id");