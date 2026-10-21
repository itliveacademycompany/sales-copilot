# syntax=docker/dockerfile:1.7
#
# Web obrazi: frontend (Vite build) + Caddy (HTTPS va reverse proxy).
# Build konteksti — repozitoriya ildizi:
#   docker build -f deploy/web.Dockerfile -t sotuv-web .
#
# Caddy domen uchun Let's Encrypt sertifikatini O'ZI oladi va yangilaydi —
# alohida certbot/cron kerak emas.

FROM node:22-bookworm-slim AS build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/frontend/dist /srv
