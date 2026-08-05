ALTER TYPE "public"."alert_kind" ADD VALUE 'score_appeal';--> statement-breakpoint
CREATE TABLE "conversation_comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"seat_id" uuid,
	"author_id" uuid,
	"body" text NOT NULL,
	"criterion_code" text,
	"seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_comment" ADD CONSTRAINT "conversation_comment_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_comment" ADD CONSTRAINT "conversation_comment_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_comment" ADD CONSTRAINT "conversation_comment_seat_id_seat_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."seat"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_comment" ADD CONSTRAINT "conversation_comment_author_id_app_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_comment_conv_idx" ON "conversation_comment" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "conversation_comment_seat_idx" ON "conversation_comment" USING btree ("seat_id","seen_at");