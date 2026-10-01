# syntax=docker/dockerfile:1
# =============================================================
# NovaCore HR Management System
# Multi-stage build: builder (berat) -> runner (ringan)
#
# Image hasil akhir: ~250 MB
# (bukan ~1.4 GB seperti railpack default)
# =============================================================

# ===================== STAGE 1: BUILD ==========================
FROM node:22-alpine AS builder

WORKDIR /app

# libc6-compat dibutuhkan beberapa native module (sharp, dll)
RUN apk add --no-cache libc6-compat

# PENTING: copy manifest DULU, baru install.
# Kalau `npm ci` dijalankan sebelum package.json ada di dalam image,
# build akan gagal dengan:
#   "npm ci can only install with an existing package-lock.json"
COPY package.json package-lock.json ./

# Cache mount untuk npm -> deploy berikutnya jauh lebih cepat
RUN --mount=type=cache,target=/root/.npm npm ci

COPY next.config.ts ./
COPY tsconfig.json ./
COPY postcss.config.mjs ./
COPY tailwind.config.ts ./

COPY src ./src
COPY public ./public

# Cache mount untuk .next/cache -> reuse antar-build
RUN --mount=type=cache,target=/app/.next/cache \
    NEXT_TELEMETRY_DISABLED=1 npm run build

# ===================== STAGE 2: RUNTIME ========================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    TZ=Asia/Jakarta \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN apk add --no-cache tzdata curl && \
    cp /usr/share/zoneinfo/Asia/Jakarta /etc/localtime && \
    echo "Asia/Jakarta" > /etc/timezone && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# node_modules sudah di-prune oleh Next.js standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Folder upload (foto bukti lembur) - fallback lokal sebelum R2 siap
RUN mkdir -p /app/data/uploads && chown -R nextjs:nodejs /app/data

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
