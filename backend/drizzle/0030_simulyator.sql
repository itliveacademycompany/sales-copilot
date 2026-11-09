-- CRM Simulyator: biznes ssenariylari va menejerlarning mashq qo'ng'iroqlari.
-- Idempotent — qayta qo'llansa ham xato bermaydi.
CREATE TABLE IF NOT EXISTS "simulyator_mashq" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"ssenariy_kalit" text NOT NULL,
	"ssenariy" jsonb NOT NULL,
	"holat" text DEFAULT 'jarayonda' NOT NULL,
	"rejim" text DEFAULT 'matn' NOT NULL,
	"boshlangan" timestamp with time zone DEFAULT now() NOT NULL,
	"tugagan" timestamp with time zone,
	"davomiylik_sek" integer DEFAULT 0 NOT NULL,
	"matn" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"natija_holat" text DEFAULT 'kutilmoqda' NOT NULL,
	"natija" jsonb,
	"fikr" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "simulyator_ssenariy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"created_by" uuid,
	"nom" text NOT NULL,
	"vaziyat" text NOT NULL,
	"maqsad" text NOT NULL,
	"mijoz_ismi" text NOT NULL,
	"mijoz_jinsi" text DEFAULT 'ayol' NOT NULL,
	"mijoz_haqida" text DEFAULT '' NOT NULL,
	"etirozlar" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"kayfiyat" text DEFAULT 'ortacha' NOT NULL,
	"davomiylik_daq" integer DEFAULT 5 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "simulyator_mashq" ADD CONSTRAINT "simulyator_mashq_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "simulyator_mashq" ADD CONSTRAINT "simulyator_mashq_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "simulyator_ssenariy" ADD CONSTRAINT "simulyator_ssenariy_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "simulyator_ssenariy" ADD CONSTRAINT "simulyator_ssenariy_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "simulyator_mashq_user_idx" ON "simulyator_mashq" USING btree ("business_id","user_id","boshlangan");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "simulyator_ssenariy_business_idx" ON "simulyator_ssenariy" USING btree ("business_id","created_at");
