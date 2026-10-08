ALTER TABLE "alert" ADD COLUMN "notified_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "alert_notify_idx" ON "alert" USING btree ("notified_at","created_at");