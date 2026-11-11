-- Simulyator: sotuvchining mashqdan keyingi fikri ("AI mijoz haqiqiy mijozdek
-- tuyuldimi?" — ha / qisman / yo'q). Rahbar mijoz modelining sifatini shu
-- bo'yicha kuzatadi. Bitta sessiyaga bitta fikr (qayta bosilsa yangilanadi).
ALTER TABLE "training_session" ADD COLUMN IF NOT EXISTS "seller_feedback" jsonb;
