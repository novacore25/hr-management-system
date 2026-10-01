# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────
# NovaCore HR Management System
# Multi-stage: builder (berat) → runner (ringan)
#
# Hasil akhir: ~250MB (bandingkan railpack default ~1.4GB)
# ─────────────────────────────────────────────────────────────

# ═══ STAGE 1: BUILD ═══════════════════════════════════════════
FROM node:22-alpine AS builder

WORKDIR /app

# Cache mount untuk .next/cache → deploy kedua jauh lebih cepat
RUN --mount=type=cache,target=/root/.npm \
    apk add --no-cache libc6-compat && \
    npm ci

COPY package*.json ./
COPY next.config.ts ./
COPY tsconfig.json ./
COPY postcss.config.mjs ./
COPY tailwind.config.ts ./

COPY src ./src
COPY public ./public
COPY supabase ./supabase

# Cache mount: reuse Turbopack/Webpack cache antar-build
RUN --mount=type=cache,target=/app/.next/cache \
    NEXT_TELEMETRY_DISABLED=1 npm run build

# ═══ STAGE 2: RUNTIME ═════════════════════════════════════════
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
    adduser  --system --uid 1001 nextjs

# Salin HANYA yang dibutuhkan runtime (node_modules sudah pruned oleh standalone)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

#Folder upload (foto bukti lembur) — fallback lokal sebelum R2 siap
RUN mkdir -p /app/data/uploads && chown -R nextjs:nodejs /app/data

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
