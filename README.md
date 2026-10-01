# NovaCore HR Management System

Sistem manajemen SDM terpadu — KPI, Absensi, Cuti, Lembur, Payroll, Surat.
Berjalan self-hosted di VPS (Coolify + Docker), bukan Supabase/Vercel lagi.

---

## Stack

| Layer | Teknologi |
|---|---|
| Framework | Next.js 15 (App Router, SSR) |
| UI | React 19 · TypeScript · Tailwind CSS 3.4 · shadcn/ui |
| Database | PostgreSQL 18 (self-hosted) |
| ORM | Drizzle ORM + Drizzle Kit |
| Auth | Auth.js v5 (Google OAuth, database session) |
| Deploy | Coolify · Docker (multi-stage standalone) · Traefik |
| Domain | `app.tntkreatif.com` |

---

## ATURAN KERAS — BACA DULU

### 1. Browser TIDAK BOLEH menyentuh database

```
✅ src/app/api/.../route.ts  →  guard  →  DAL  →  db
❌ src/app/ atau components/ →  db        (DILARANG)
```

Semua file di `src/db/` memakai `import "server-only"`. Kalau ada yang salah
import dari komponen client, **build akan gagal** — itu memang disengaja.

### 2. Otorisasi SELALU di server

Tidak ada lagi RLS. Guard ada di `src/server/dal/guards.ts`:

```ts
requireUser()                        // semua yang login
requireKpiRole("hr", "executive")     // cek role KPI
requireKpiRoleAtLeast("head")         // minimal Head
requireAbsensiAdmin()                 // absensi_role = 'admin'
requireActiveAbsensiStaff()           // absensi_status = 'active'
```

Guard bersifat **fail-closed**: session tidak ada → lempar 401, bukan `null`.

### 3. Dua sumbu role itu BERBEDA

| Sumbu | Kolom | Dipakai untuk |
|---|---|---|
| Sistem KPI | `users.kpi_role` | `/dashboard/**` |
| Sistem Absensi | `users.absensi_role` | `/absensi/admin/**` |

Jangan samakan keduanya. Guard juga terpisah.

### 4. Invariant KPI — jangan diubah

```ts
kpis.monthlyTarget        // TOTAL untuk KPI ini (sum semua assignee)
kpiAssignments.monthlyTarget  // PER ORANG (bisa beda antar assignee)

kpiAssignments.achievementPercentage  // PACE RATE (actual / expected-by-now)
// UI harus hitung sendiri: actual_total / monthly_target * 100
// JANGAN tampilkan achievementPercentage sebagai "Pencapaian"
```

### 5. Semua kolom `userId` bertipe `text`, bukan `uuid`

Karena Auth.js memakai string id. Sudah bersifat global di schema.

---

## Struktur

```
src/
├── app/                      # Halaman + Route Handler
│   ├── api/auth/[...nextauth]/  # Auth.js handlers
│   ├── api/health/              # Healthcheck Docker
│   ├── dashboard/               # 40 halaman KPI (role-based)
│   ├── absensi/                 # 20 halaman absensi/payroll
│   └── login/                   # Login Google OAuth
├── db/                       # ← HANYA server
│   ├── schema.ts              # Definisi 25 tabel Drizzle
│   └── index.ts               # Koneksi + pg.Pool (max 10)
├── server/                   # ← HANYA server
│   ├── auth.ts                # Konfigurasi Auth.js v5
│   └── dal/
│       └── guards.ts          # Gerbang otorisasi
├── lib/
│   ├── auth-client.ts         # Client Auth.js (browser)
│   ├── utils.ts               # Format, calcWeightedScore, working days
│   └── overtimeHelpers.ts     # Kalkulasi lembur Depnaker
├── hooks/                    # 19 hook (⚠️ masih Supabase — Fase 2)
└── components/, types/       # UI (tidak berubah)
```

---

## Menjalankan Secara Lokal

```bash
# 1. Install
npm install

# 2. Siapkan env
cp .env.example .env.local
#   lalu isi DATABASE_URL, AUTH_SECRET, AUTH_GOOGLE_ID/SECRET

# 3. Generate AUTH_SECRET
openssl rand -base64 32

# 4. Buat database lalu jalankan migration
npm run db:push

# 5. Jalankan
npm run dev
```

Database lokal bisa pakai Docker:

```bash
docker run -d --name db_hr_local \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=db_hr_system \
  -p 5432:5432 postgres:18-alpine
```

---

## Perintah

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Build produksi |
| `npm run typecheck` | Cek TypeScript (JALANKAN SEBELUM deploy) |
| `npm run db:generate` | Generate file migration dari schema |
| `npm run db:push` | Terapkan schema langsung ke DB |
| `npm run db:studio` | Drizzle Studio (GUI database) |
| `npm run db:migrate` | Jalankan migration files |

---

## Deploy

### Coolify

| Setting | Nilai |
|---|---|
| Build Pack | **Dockerfile** |
| Port | `3000` |
| Health check path | `/api/health` |
| Node image | `node:22-alpine` |

Coolify otomatis menyediakan `DATABASE_URL` bila app di-link ke database.

Environment variables (isi via UI Coolify, **jangan** di file):

```
AUTH_SECRET=<32-byte base64>
AUTH_TRUST_HOST=1
AUTH_URL=https://app.tntkreatif.com
AUTH_GOOGLE_ID=<dari Google Cloud Console>
AUTH_GOOGLE_SECRET=<dari Google Cloud Console>
NODE_ENV=production
TZ=Asia/Jakarta
```

### Manual

```bash
npm run typecheck          # WAJIB, 0 error
npm run build
docker build -t nova-hr .
docker run -d -p 3000:3000 --env-file .env.local nova-hr
```

---

## Images

Multi-stage build menghasilkan image **~250 MB** (bukan ~1.4 GB seperti
railpack default). Dependency berat (`exceljs`, `jspdf`, `html2canvas`,
`docxtemplater`) di-lazy-load saat dipakai, bukan dibundel di awal.

---

## Storage Foto Bukti

Phase 1 → folder lokal di `/app/data/uploads`.
Phase 6 → Cloudflare R2 (env: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`).

---

## Roadmap

| Fase | Status |
|---|---|
| 0 — Prasyarat (DNS, OAuth, rotasi key) | ⬜ Manual |
| 1 — Fondasi (schema, Auth.js, deploy) | ✅ Selesai |
| 2 — Ganti 19 hook Supabase → Route Handler + DAL | ⬜ |
| 3 — Modul KPI | ⬜ |
| 4 — Modul Absensi | ⬜ |
| 5 — Payroll | ⬜ |
| 6 — Migrasi data + R2 | ⬜ |
