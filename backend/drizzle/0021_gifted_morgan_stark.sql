CREATE TABLE "crm_sync_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"integration_id" uuid NOT NULL,
	"kind" "integration_kind" NOT NULL,
	"entity" text NOT NULL,
	"local_id" uuid NOT NULL,
	"status" text NOT NULL,
	"crm_entity" text,
	"crm_entity_id" text,
	"crm_entity_name" text,
	"crm_url" text,
	"crm_record_id" text,
	"crm_responsible_id" text,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_sync_item" ADD CONSTRAINT "crm_sync_item_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_sync_item" ADD CONSTRAINT "crm_sync_item_integration_id_integration_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integration"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_sync_item_uq" ON "crm_sync_item" USING btree ("integration_id","entity","local_id");--> statement-breakpoint
CREATE INDEX "crm_sync_item_business_idx" ON "crm_sync_item" USING btree ("business_id","updated_at");