#!/bin/sh
# Kunlik baza zaxirasi. Cron (root):
#   15 3 * * * /opt/sotuv/backup.sh >> /opt/sotuv/backups/backup.log 2>&1
#
# Custom format (-Fc): siqilgan, pg_restore bilan tanlab tiklasa bo'ladi.
# 14 kundan eskisi o'chiriladi. Serverning O'ZIDAGI zaxira disk buzilsa
# yordam bermaydi — haftada bir marta boshqa joyga (o'z kompyuteringiz,
# boshqa VPS) ko'chirib turing: scp root@SERVER:/opt/sotuv/backups/*.dump .
set -eu
cd /opt/sotuv
mkdir -p backups
file="sotuv-$(date +%F-%H%M).dump"
docker compose exec -T db pg_dump -U postgres -d sotuv -Fc -f "/backups/$file"
find backups -name 'sotuv-*.dump' -mtime +14 -delete
echo "$(date -Is) zaxira tayyor: $file ($(du -h "backups/$file" | cut -f1))"
