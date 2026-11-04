-- CRM bosh sahifasi (amoCRM namunasi): tizimdan foydalanish daqiqalari va
-- foydalanuvchi vidjetlari. Idempotent — qayta qo'llansa ham xato bermaydi.
CREATE TABLE IF NOT EXISTS "crm_activity" (
	"business_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"minutes" integer DEFAULT 0 NOT NULL,
	"first_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_activity_business_id_user_id_day_pk" PRIMARY KEY("business_id","user_id","day")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_dashboard" (
	"business_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"widgets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_dashboard_business_id_user_id_pk" PRIMARY KEY("business_id","user_id")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "crm_activity" ADD CONSTRAINT "crm_activity_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "crm_activity" ADD CONSTRAINT "crm_activity_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "crm_dashboard" ADD CONSTRAINT "crm_dashboard_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "crm_dashboard" ADD CONSTRAINT "crm_dashboard_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_activity_day_idx" ON "crm_activity" USING btree ("business_id","day");
