# syntax=docker/dockerfile:1.7
#
# Backend obrazi: Fastify API + AI worker + lokal STT (GigaAM, CPU).
# Build konteksti — repozitoriya ILDIZI (tools/ papkasi ham kerak):
#   docker build -f backend/Dockerfile -t sotuv-backend .
#
# Nega bitta obraz: worker STT'ni `child_process` orqali python skript
# bilan ishga tushiradi (calls/pipeline.ts) — node va python bir konteynerda
# bo'lishi shart. GPU yo'q server uchun torch'ning CPU varianti o'rnatiladi
# (CUDA varianti ~2.5 GB ortiqcha va baribir ishlatilmaydi).

# ─── 1. TypeScript build ─────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
# rls.sql — TS emas, tsc uni dist'ga ko'chirmaydi; migrate.ts uni yonidan o'qiydi.
RUN npm run build \
 && cp src/db/rls.sql dist/db/rls.sql \
 && npm prune --omit=dev

# ─── 2. Ishga tushirish muhiti: python (STT) + node ──────────────────────────
FROM python:3.12-slim-bookworm AS runtime

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg libstdc++6 ca-certificates tini curl \
 && rm -rf /var/lib/apt/lists/*

# Node'ni rasmiy obrazdan olamiz (python obrazida yo'q).
COPY --from=node:22-bookworm-slim /usr/local/bin/node /usr/local/bin/node

# STT muhiti. Bitta pip chaqiruvida CPU indeksi BIRINCHI: aks holda boshqa
# paket (pyannote, transformers) torch'ni PyPI'dagi CUDA variantiga
# "yangilab" yuborishi mumkin.
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
COPY tools/requirements-gigaam.txt /tmp/requirements-gigaam.txt
RUN python -m venv /opt/stt \
 && /opt/stt/bin/pip install \
      --index-url https://download.pytorch.org/whl/cpu \
      --extra-index-url https://pypi.org/simple \
      -r /tmp/requirements-gigaam.txt \
 && /opt/stt/bin/python -c "import torch, sys; print('torch', torch.__version__); sys.exit(0 if '+cpu' in torch.__version__ else 'torch CPU varianti emas - obraz keraksiz kattalashadi')"

RUN useradd --create-home --uid 10001 app \
 && mkdir -p /data/hf \
 && chown -R app:app /data

WORKDIR /app
COPY tools ./tools
COPY backend/drizzle ./backend/drizzle
COPY backend/package.json ./backend/package.json
COPY --from=build /app/backend/node_modules ./backend/node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY deploy/backend-entrypoint.sh /usr/local/bin/backend-entrypoint
RUN chmod +x /usr/local/bin/backend-entrypoint

# pipeline.ts skriptni `process.cwd()/../tools` dan qidiradi.
WORKDIR /app/backend
ENV NODE_ENV=production \
    PORT=3000 \
    GIGAAM_PYTHON=/opt/stt/bin/python \
    STT_DEVICE=cpu \
    HF_HOME=/data/hf

USER app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/healthz || exit 1

ENTRYPOINT ["tini", "--", "backend-entrypoint"]
