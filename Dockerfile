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

# Fail cepat kalau middleware hilang, jangan sampai diam-diam.
#
# Next.js TIDAK error kalau middleware tidak ter-build. Dia hanya menulis
# `middleware: {}` ke middleware-manifest.json, jadi proteksi route di
# level halaman hilang tanpa jejak di log build. Guard ini yang membuat
# masalah itu ketahuan.
#
# Dua penyebab yang sudah pernah kejadian di repo ini:
#   1. File di root. Project memakai direktori src/, jadi Next.js
#      mencarinya di src/middleware.ts dan mengabaikan root.
#   2. Rantai import menyentuh database. Middleware = edge bundle,
#      jadi menarik server-only / pg membuatnya gagal dibuild.
RUN node -e 'var m=require("/app/.next/server/middleware-manifest.json");var n=Object.keys(m.middleware||{}).length;if(n===0){console.error("FATAL: middleware tidak ter-build.");console.error("Cek 1: file harus di src/middleware.ts, bukan root (project pakai direktori src/).");console.error("Cek 2: import middleware jangan menarik server-only atau pg (middleware = edge bundle).");process.exit(1)}console.log("OK: middleware ter-build ->",Object.keys(m.middleware).join(", "));'

# ===================== STAGE 2: RUNTIME ========================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    TZ=Asia/Jakarta \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# TAHAP INI SENGAJA TIDAK MEMAKAI `apk add`.
#
# Sebelumnya: `apk add --no-cache tzdata curl`. Baris itu mengunduh
# paket dari internet, jadi satu gangguan jaringan sesaat langsung
# menggagalkan seluruh deployment. Enam kali berturut-turut terjadi
# pada 3-4 Oktober 2026:
#
#   WARNING: fetching https://dl-cdn.alpinelinux.org/... DNS: transient error
#   ERROR: unable to select packages: curl (no such package)
#
# Pesan "no such package" itu menyesatkan: curl dan tzdata pasti ada
# di Alpine. Yang tidak ada adalah salinan indeks paket, jadi Alpine
# menyimpulkan paketnya tidak ada.
#
# Mengganti resolver hanya memindahkan masalahnya ke tempat lain. Selama
# build masih perlu mengunduh sesuatu, build masih bisa gagal karena
# jaringan. Yang perlu dihilangkan adalah kebutuhannya:
#
#   addgroup / adduser   BusyBox, sudah ada di Alpine
#   zona waktu           ENV TZ di atas sudah cukup; lihat catatan di bawah
#   health check         BusyBox `wget` selalu ada, tidak perlu diunduh
#
# Kalau nanti memang butuh paket tambahan, taruh di tahap builder:
# cache-nya sudah terpakai dan tidak terputus oleh perubahan argumen
# Coolify. Tahap runtime dibangun ulang tiap kali ARG berubah, jadi tidak
# pernah di-cache -- itulah sebabnya tahap runtime yang gagal, bukan builder.
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Zona waktu.
#
# `ENV TZ=Asia/Jakarta` di atas sudah membuat Node.js memakai zona itu:
# Node 22 membawa ICU penuh dan membaca TZ dari environment tanpa
# bergantung pada berkas /usr/share/zoneinfo.
#
# /etc/localtime tetap dipasang kalau ada, karena `date` dari BusyBox dan
# beberapa pustaka native membacanya langsung. Dipakai opsional supaya
# build tidak gagal hanya karena berkasnya tidak ada.
RUN if [ -f /usr/share/zoneinfo/Asia/Jakarta ]; then \
      cp /usr/share/zoneinfo/Asia/Jakarta /etc/localtime && \
      echo "Asia/Jakarta" > /etc/timezone; \
    fi

# node_modules sudah di-prune oleh Next.js standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Folder upload (foto bukti lembur) - fallback lokal sebelum R2 siap
RUN mkdir -p /app/data/uploads && chown -R nextjs:nodejs /app/data

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  # BusyBox `wget`, bukan `curl`.
#
# `curl` sebelumnya diunduh lewat `apk add` hanya untuk baris ini.
# BusyBox sudah menyertakan wget, jadi health check tidak butuh
# jaringan luar sama sekali -- hanya localhost.
# PENTING: 127.0.0.1, BUKAN localhost.
#
# Di Alpine, `getent localhost` mengembalikan ::1 -- IPv6 -- lebih dulu:
#
#   ::1               localhost
#   127.0.0.1         localhost
#
# Next.js hanya mendengarkan di 0.0.0.0 (IPv4), jadi wget yang memakai
# `localhost` mencoba IPv6 dan mendapat "Connection refused". Diuji
# dengan server yang benar-benar mendengarkan di 0.0.0.0:3000:
#
#   localhost  : 0 berhasil, 10 gagal
#   127.0.0.1  : 10 berhasil, 0 gagal
#
# Gejalanya sangat menyesatkan, karena aplikasi benar-benar hidup:
# log build menunjukkan "Ready in 257ms", lalu health check gagal
# dengan Connection refused, Coolify menyebut container tidak sehat,
# dan seluruh deployment dibatalkan -- padahal kodenya jalan sempurna.
CMD wget -q -O - http://127.0.0.1:3000/api/health > /dev/null || exit 1

CMD ["node", "server.js"]
