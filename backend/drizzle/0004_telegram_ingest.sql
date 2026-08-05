ALTER TABLE "conversation" ADD COLUMN "external_thread_id" text;--> statement-breakpoint
ALTER TABLE "transcript_segment" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "transcript_segment" ADD COLUMN "external_sender_id" text;--> statement-breakpoint
CREATE INDEX "conversation_thread_idx" ON "conversation" USING btree ("business_id","channel","external_thread_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "transcript_segment_external_uq" ON "transcript_segment" USING btree ("business_id","external_id");