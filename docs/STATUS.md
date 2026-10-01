# STATUS MIGRASI — dibaca sebelum mengerjakan apa pun

Terakhir diperbarui: setelah commit `65e4dca`
(`feat(kpi): 4b selesai - admin/dashboard + perbaiki widget check-in`)

---

## Ringkasan

Migrasi Supabase → VPS **belum selesai**. Yang sudah selesai adalah
seluruh **lapisan server** untuk absensi + sebagian KPI. Yang belum:
sebagian halaman `/dashboard/**`, modul overtime, payroll, storage, dan
**pemindahan data asli**.

---

## Yang SUDAH selesai

### Lapisan infrastruktur

| Item | Status |
|---|---|
| 26 tabel Drizzle | ✅ di VPS |
| Auth.js v5 + Google OAuth | ✅ working |
| Middleware proteksi route | ✅ working (perbaiki 5e80ece) |
| Strategi sesi konsisten | ✅ JWT untuk app + middleware (990dadc) |
| Dockerfile multi-stage standalone | ✅ ~250 MB |
| Guard `verify:build` (middleware) | ✅ |
| Guard `verify:stub` (stub import) | ✅ |
| Health check `/api/health` | ✅ |
| Migrations 0000–0009 | ✅ semua di VPS |

### Fase 1 — Pembersihan

Repo dibersihkan: `local.env` (berisi `service_role` Supabase), Firebase,
Supabase Edge Functions, `.ai-context`. Git remote diganti ke
`git@github.com:novacore25/hr-management-system.git`.

### Fase 2 — Server layer KPI

`src/server/dal/{kpi,assignments,period,users,departments}.ts`.
Endpoint: `/api/kpis`, `/api/assignments`, `/api/assignments/period`,
`/api/daily-reports`, `/api/users`, `/api/departments`, `/api/kpi-settings`,
`/api/me`, `/api/me/profile`.

**Catatan penting:** Fase 2 yang "selesai" itu hanya **hooks**. Halaman
`/dashboard/**` sendiri masih memanggil stub — lihat tabel di bawah.

### Fase 4a — Server layer absensi

`src/server/dal/{absensi,attendance,leave}.ts`.
Endpoint: `/api/absensi/{settings,attendance,leave,logs,staff,team,dashboard,locations,summary,letters}`.

### Fase 4b — Halaman absensi ✅ COMPLETE

Tidak ada lagi halaman `/absensi/**` yang memanggil stub, kecuali modul
overtime & payroll yang sengaja ditunda.

| Halaman | Status |
|---|---|
| `/absensi/admin/dashboard` | ✅ 4b |
| `/absensi/admin/settings` | ✅ 4b |
| `/absensi/admin/logs` | ✅ 4b (dipulihkan dari 0 byte) |
| `/absensi/admin/latereasons` | ✅ 4b |
| `/absensi/admin/staff` | ✅ 4b batch 4 |
| `/absensi/admin/letters` | ✅ 4b batch 3 |
| `/absensi/profile` | ✅ 4b batch 2 |
| `/absensi/(staff)/team` | ✅ 4b |
| `/absensi/(staff)/requests` | ✅ 4b batch 2 |
| `/absensi/(staff)/kpi` | ✅ 4b batch 3 |
| `/absensi/(staff)/letters` | ✅ 4b batch 3 |
| `AttendanceWidget` (`/dashboard/tim`) | ✅ 4b — **fitur inti, sebelumnya "sukses palsu"** |

---

## Yang BELUM selesai

### `/dashboard/**` — 13 halaman masih kosong

Ini Prioritas 1. Semuanya memanggil stub sehingga tampil kosong, padahal
fitur intinya sudah ada servernya.

| Halaman | Query | Ukuran |
|---|---|---|
| `/dashboard/hr/kpi` | 14 | 817 baris — terbesar |
| `/dashboard/hr/employees` | 3 | 432 |
| `/dashboard/head/quality` | 3 | 461 |
| `/dashboard/hr/evaluasi-hr` | 3 | 243 |
| `/dashboard/head/kpi-setup` | 4 | 330 |
| `/dashboard/head/penugasan` | 2 | 332 |
| `/dashboard/head/penugasan/new` | 3 | 388 |
| `/dashboard/executive/quality` | 3 | 400 |
| `/dashboard/tim/history` | 3 | 345 |
| `/dashboard/hr/assignments` | 2 | 391 |
| `/dashboard/hr/assignments/new` | 3 | 538 |
| `/dashboard/developer/import` | 5 | 661 |
| `/dashboard/developer/feedbacks` | 2 | 192 |

Sudah jadi: `/dashboard/hr/quality` (commit `65e4dca`).

Component pendukung yang juga masih pakai stub:
`components/kpi/{DailyInputForm,DailyActivityFeed,DailyReportsViewer}`,
`components/hr/KpiFormPage`, `components/FeedbackModal`.

### Fase 4c — Overtime (belum mulai)

`/absensi/admin/overtime` (4 query), bagian overtime di
`/absensi/admin/approvals` (7 query), `OvertimeStaffSection`,
`OvertimeFinalizeModal`. Perhitungan Depnaker ada di
`src/lib/overtimeHelpers.ts` — masih di client, harus pindah ke server.

Tabel `overtime_requests` sudah ada dengan 35 kolom termasuk
`proof_images`, `calculation_breakdown`, `total_overtime_pay`.

### Fase 4d — Cloudflare R2 (belum mulai)

Menunggu: upload bukti lembur (`overtime_proofs`), template & berkas
surat.Dampak: saat ini `fileUrl` selalu `null` dan link "Unduh"
disembunyikan.

### Fase 5 — Payroll (belum mulai)

`/absensi/admin/payroll`, `/absensi/admin/payroll/settings`,
`/absensi/(staff)/payroll`. Tabel sudah ada (`payrolls`,
`payroll_staff_settings`, `payroll_addition_types`,
`payroll_deduction_types`).

### Fase 6 — Migrasi data (belum mulai)

`pg_dump` Supabase → transform → load. **Ini yang paling berisiko.**
Yang perlu diputuskan dulu:
- `public.users.id` adalah UUID, sedangkan Auth.js pakai string TEXT.
  Perlu transformasi id.
- Tabel `auth.users` tidak ikut; user harus login ulang dengan Google.
- `session.strategy` sudah JWT, jadi tidak ada sesi lama yang perlu dibawa.

---

## Migrasi 0010 — BELUM ADA, perlu dibuat

Ditemukan saat menyiapkan database uji:

`departments.name` **tidak punya constraint UNIQUE** (hanya PK `id`).
Sama untuk `office_locations.name`, `kpis.title`, `letter_types.code`.

Dampak: dua admin bisa membuat divisi "TNT" dua kali. Dropdown filter
KPI jadi ambigu, `department_locations` bisa menunjuk divisi yang salah.

**Cara aman:** cek duplikat dulu, kalau ada **BAIL dan lapor** — jangan
langsung drop data. Contoh:

```sql
SELECT name, count(*) FROM departments
GROUP BY name HAVING count(*) > 1;
```

Pola yang sama kemungkinan berlaku untuk 3 tabel lain.

---

## Database uji lokal

Sudah siap dan terisi (lihat `docs/LOCAL-TESTING.md`).

Data uji sengaja mencakup kasus tepi supaya mudah diuji ulang:
- `u-pending-001` — status `pending` (uji badge tab)
- `u-hidden-001` — `is_hidden = true` (uji ghost mode)
- `u-staff-003` — kontrak berakhir `2026-12-31` (uji badge "Kontrak H-n")
- `Bayu Saputra` punya 25 menit keterlambatan + alasan pending (uji tab Denda)

---

## Riwayat commit (referensi cepat)

| Commit | Isi |
|---|---|
| `65e4dca` | `/dashboard/hr/quality` + guard `verify:stub` |
| `c7429b2` | 4b selesai: admin/dashboard + fix AttendanceWidget |
| `990dadc` | Fix strategi sesi (login bounce) |
| `5e80ece` | Fix middleware + pulihkan `admin/logs` 0 byte |
| `58249cd` | 4b batch 4: admin/staff + global KPI weights |
| `8d10d0a` | 4b batch 3: kpi + letters + fix nomor surat |
| `0d2985c` | 4b batch 2: profile + requests |
| `55c771d` | 4b batch 1: team, latereasons, logs, settings |
| `634ca2a` | 4a: server layer absensi |