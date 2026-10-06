-- Outbox ustunlarini TARIX uchun to'ldirish.
--
-- `alert.notified_at` (0012) va `task.exported_at` (0013) qo'shilganda
-- mavjud barcha yozuvlar `null` bo'lib qoldi — ya'ni dispetcherlar
-- nazarida ularning HAMMASI "hali yuborilmagan".
--
-- Buning oqibati deploy paytida ko'rinardi: bildirishnomalar yoqilgan
-- biznes o'zining butun ogohlantirish tarixini Telegram'ga, CRM eksporti
-- yoqilgani esa barcha eski vazifalarni webhookka olardi. Foydalanuvchi
-- uchun bu — yuzlab keraksiz xabar.
--
-- Shuning uchun migratsiya paytida mavjud yozuvlar "allaqachon ko'rib
-- chiqilgan" deb belgilanadi. Yangi funksiyalar SHU PAYTDAN keyin
-- yaratilgan yozuvlarga qo'llanadi — kutilgan xatti-harakat aynan shu.
--
-- `created_at` qo'yiladi, `now()` emas: yozuv qachon yaratilgan bo'lsa,
-- "o'sha paytda ko'rib chiqilgan" deyish tarixni to'g'riroq aks ettiradi
-- va hisobotlarda soxta cho'qqi hosil qilmaydi.

UPDATE "alert" SET "notified_at" = "created_at" WHERE "notified_at" IS NULL;
--> statement-breakpoint
UPDATE "task" SET "exported_at" = "created_at" WHERE "exported_at" IS NULL;
