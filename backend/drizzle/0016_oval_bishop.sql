ALTER TABLE "seat" ADD COLUMN "activation_expires_at" timestamp with time zone;--> statement-breakpoint
-- Eski tokenlar ochiq matnda saqlangan edi va ularni qabul qiladigan endpoint bo'lmagan —
-- hech biri ishlatilmagan. Xesh formatiga mos kelmagani uchun tozalanadi: rahbar yangisini oladi.
UPDATE "seat" SET "activation_token" = NULL WHERE "activation_token" IS NOT NULL;
