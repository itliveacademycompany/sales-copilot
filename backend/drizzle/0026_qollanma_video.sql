CREATE TYPE "public"."guide_source" AS ENUM('link', 'file');--> statement-breakpoint
CREATE TYPE "public"."guide_status" AS ENUM('waiting', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "guide_video" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" text,
	"source" "guide_source" NOT NULL,
	"url" text,
	"thumbnail_url" text,
	"status" "guide_status" DEFAULT 'ready' NOT NULL,
	"error" text,
	"file_name" text,
	"file_size" bigint,
	"file_mime" text,
	"has_poster" boolean DEFAULT false NOT NULL,
	"duration_sec" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guide_video" ADD CONSTRAINT "guide_video_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guide_video_order_idx" ON "guide_video" USING btree ("sort_order","created_at");--> statement-breakpoint
-- Birinchi qo'llanma: "Qo'ng'iroqlar" bo'limi. Fayl web obrazida turadi
-- (frontend/public/qollanma-media/) — Caddy uni Range so'rovlari bilan beradi.
INSERT INTO "guide_video" ("title", "description", "category", "source", "url", "thumbnail_url", "status", "duration_sec", "sort_order", "is_published")
VALUES (
	'Qo''ng''iroqlar bo''limi bilan ishlash',
	'Qo''ng''iroqlar ro''yxati, qidiruv va filtrlar, qo''ng''iroqni qo''lda yuklash, Excel/CSV ga eksport, Moi Zvonki ulanishi hamda har bir qo''ng''iroqning AI tahlili — qisqa xulosa, baho va transkript qanday ko''rinishi.',
	'Qo''ng''iroqlar',
	'link',
	'/qollanma-media/qongiroqlar-bolimi.mp4',
	'/qollanma-media/qongiroqlar-bolimi.jpg',
	'ready',
	204,
	1,
	true
);
