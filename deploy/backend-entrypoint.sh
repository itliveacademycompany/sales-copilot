#!/bin/sh
# Backend konteyneri ishga tushganda:
#   1. sotuv_app rolini tekshiradi/yaratadi (RLS uchun superuser bo'lmagan rol)
#   2. migratsiyalar + RLS siyosatlarini qo'llaydi (idempotent)
#   3. serverni ishga tushiradi (worker ham shu jarayonda)
#
# Xato bo'lsa konteyner ishga tushmaydi — yarim migratsiyalangan bazada
# ishlab ketgandan ko'ra shu xavfsizroq.
set -eu

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  node dist/db/bootstrap-role.js
  node dist/db/migrate.js
fi

exec node dist/server.js
