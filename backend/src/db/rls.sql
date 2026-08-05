-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY — tenant izolyatsiyasi
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Bu fayl idempotent: xohlagancha qayta ishga tushirish mumkin.
-- Har migratsiyadan keyin avtomatik qo'llanadi (src/db/migrate.ts).
--
-- ISHLASH PRINSIPI
--   Ilova har so'rovni `withTenant(businessId, ...)` ichida bajaradi.
--   U tranzaksiyaga `app.business_id` sozlamasini o'rnatadi.
--   Quyidagi siyosatlar har bir qatorni shu qiymat bilan solishtiradi.
--
-- ⚠ ENG MUHIM SHART: ILOVA SUPERUSER OSTIDA ULANMASLIGI KERAK
--   PostgreSQL'da superuser RLS ni HAR DOIM chetlab o'tadi — `FORCE` ham
--   unga ta'sir qilmaydi. Jadval egasi esa FORCE'siz chetlab o'tadi.
--   Shuning uchun:
--     • ilova       → sotuv_app roli (NOSUPERUSER, NOBYPASSRLS)
--     • migratsiya  → postgres (egalik)
--   `npm run db:bootstrap` shu rolni yaratadi, `npm run db:verify` esa
--   izolyatsiya haqiqatan ishlayotganini isbotlaydi.
--
-- NEGA SIYOSATDA "BYPASS" TESHIGI YO'Q
--   Avvalgi variantda `app.bypass_rls` sessiya o'zgaruvchisi orqali chetlab
--   o'tish mumkin edi. Bu xavfli: SQL injection topilsa, hujumchi shunchaki
--   `SET app.bypass_rls='on'` qilib butun izolyatsiyani o'chirardi.
--   Endi chetlab o'tishning yagona yo'li — boshqa ulanish (egalik roli),
--   ya'ni tarmoq va kredensial darajasidagi chegara.
--
-- NEGA `NULLIF(..., '')`
--   `current_setting('app.business_id', true)` sozlanmagan bo'lsa bo'sh satr
--   qaytaradi va `::uuid` ga o'tkazishda xato beradi. NULLIF orqali NULL
--   bo'ladi, taqqoslash NULL → FALSE → hech qanday qator ko'rinmaydi.
--   Ya'ni sukut bo'yicha holat "hammasi yopiq".

-- ── Yordamchi funksiya ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app_current_business_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
AS $$
  SELECT NULLIF(current_setting('app.business_id', true), '')::uuid
$$;

-- Eski, xavfli teshikni olib tashlaymiz (agar avvalgi versiyadan qolgan bo'lsa).
DROP FUNCTION IF EXISTS app_rls_bypassed() CASCADE;

-- ── Siyosatni jadvalga qo'llaydigan umumiy protsedura ───────────────────────
DO $$
DECLARE
  t text;
  col text;
  -- business_id ustuni bo'lgan jadvallar
  tenant_tables text[] := ARRAY[
    'department', 'business_member', 'seat', 'work_schedule',
    'playbook', 'playbook_simulation',
    'contact', 'conversation', 'transcript_segment', 'analysis',
    'criterion_score', 'score_appeal',
    'commitment', 'task',
    'integration', 'sync_log',
    'analysis_job',
    'subscription', 'billing_transaction', 'usage_record',
    'alert', 'dashboard_layout', 'audit_log', 'daily_summary'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      RAISE NOTICE 'RLS: % jadvali topilmadi, o''tkazib yuborildi', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON public.%I
        USING (business_id = app_current_business_id())
        WITH CHECK (business_id = app_current_business_id())
    $f$, t);
  END LOOP;

  -- `business` jadvalida ustun `id` deb ataladi, `business_id` emas.
  IF to_regclass('public.business') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.business ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.business FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON public.business';
    EXECUTE $f$
      CREATE POLICY tenant_isolation ON public.business
        USING (id = app_current_business_id())
        WITH CHECK (id = app_current_business_id())
    $f$;
  END IF;
END
$$;

-- ── RLS QO'LLANMAYDIGAN jadvallar (ataylab) ─────────────────────────────────
--
--   app_user          Bitta odam bir nechta biznesda bo'ladi (FR-08).
--                     Kirish huquqi `business_member` / `seat` orqali
--                     ilova darajasida tekshiriladi.
--   session           Foydalanuvchiga bog'langan, biznesga emas.
--   playbook_template Platforma darajasidagi umumiy shablonlar (FR-32).
--
-- Bu uch jadvalga tegadigan har bir so'rov ilova kodida aniq
-- `userId` filtri bilan yozilishi SHART.
