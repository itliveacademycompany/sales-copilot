-- Moi Zvonki mijoz ismini bo'sh satr ("") qilib saqlardi. Frontend "" ni
-- haqiqiy ism deb olib, telefon raqamiga o'tmasdi (Qo'ng'iroqlar ro'yxatida
-- mijoz ko'rinmasdi), CRM esa "Kontaktsiz" deb ko'rsatardi. Bo'sh ism = NULL.
UPDATE "contact" SET "name" = NULL WHERE "name" IS NOT NULL AND btrim("name") = '';
