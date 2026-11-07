-- Ichki CRM: ijtimoiy tarmoq integratsiyalari (Facebook, Instagram, Telegram).
-- Lidlar "Saralanmagan"ga tushadi. Idempotent — qayta qo'llansa ham xato bermaydi.
ALTER TYPE "public"."integration_kind" ADD VALUE IF NOT EXISTS 'crm_facebook';--> statement-breakpoint
ALTER TYPE "public"."integration_kind" ADD VALUE IF NOT EXISTS 'crm_instagram';--> statement-breakpoint
ALTER TYPE "public"."integration_kind" ADD VALUE IF NOT EXISTS 'crm_telegram';
