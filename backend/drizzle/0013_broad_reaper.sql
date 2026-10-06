ALTER TABLE "task" ADD COLUMN "exported_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "export_error" text;--> statement-breakpoint
CREATE INDEX "task_export_idx" ON "task" USING btree ("exported_at","created_at");