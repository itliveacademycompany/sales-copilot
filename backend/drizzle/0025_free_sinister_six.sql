ALTER TABLE "crm_field" ADD COLUMN "integration_id" uuid;--> statement-breakpoint
ALTER TABLE "crm_field" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "crm_pipeline" ADD COLUMN "integration_id" uuid;--> statement-breakpoint
ALTER TABLE "crm_pipeline" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "crm_stage" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "deal" ADD COLUMN "integration_id" uuid;--> statement-breakpoint
ALTER TABLE "deal" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "deal" ADD COLUMN "external_url" text;--> statement-breakpoint
ALTER TABLE "crm_field" ADD CONSTRAINT "crm_field_integration_id_integration_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integration"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_pipeline" ADD CONSTRAINT "crm_pipeline_integration_id_integration_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integration"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_integration_id_integration_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integration"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_field_external_uq" ON "crm_field" USING btree ("integration_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_pipeline_external_uq" ON "crm_pipeline" USING btree ("integration_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_stage_external_uq" ON "crm_stage" USING btree ("pipeline_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deal_external_uq" ON "deal" USING btree ("integration_id","external_id");