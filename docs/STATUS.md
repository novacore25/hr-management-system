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
| Migrations 0010–0012 | ⬜ baru, harus di VPS |
| `withAuth` meneruskan Response apa adanya | ✅ baru (semua Route Handler) |

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

### `/dashboard/**` — 4 halaman masih kosong

Ini Prioritas 1. Semuanya memanggil stub sehingga tampil kosong, padahal
fitur intinya sudah ada servernya.

| Halaman | Query | Ukuran |
|---|---|---|
| `/dashboard/hr/kpi` | 14 | 817 baris — terbesar |
| `/dashboard/hr/employees` | 3 | 432 |
| `/dashboard/head/kpi-setup` | 4 | 330 |
| `/dashboard/developer/import` | 5 | 661 |

Sudah jadi: 4 halaman kualitas, 4 halaman penugasan,
`developer/feedbacks`, `tim/history`.

### Halaman KPI kualitas — sudah selesai, dengan tiga perbaikan

Empat halaman itu formerly melakukan 2 operasi dari browser per Simpan
(upsert `monthly_scores` + update `kpi_assignments`), percentage dihitung
di client, `monthly_scores.monthly_target` tidak pernah ditulis, dan
`achievement_percentage` bisa ditulis apa pun termasuk di luar 0-100.

Sekarang satu request; percentage, target, dan kelayakan divisi diputuskan
server. Yang ikut ditemukan:

1. **Scoping bocor.** Divisi Head datang dari `AuthContext`. Sekarang dari
   `users.managed_departments` di database, dan `assertCanScore` menolak
   assignment di luar divisi itu.
2. **`kpis.brand` tidak pernah ada** di schema, padahal
   `executive/quality` sudah `select` dan merender label-nya. Badge brand
   tidak pernah tampil. Ditambahkan di migrasi `0011`.
3. **Tipe KPI terbuang.** Halaman lama menampilkan `quality` **dan**
   `lead_tim` dalam satu daftar; `evaluasi-hr` memakai `lead_tim` + `hr`.
   Filter server awalnya hanya `quality`, jadi KPI Lead Tim hilang.

Endpoint: `GET/PUT /api/kpi/quality` dengan `scope=self|managed|all`,
`kpiTypes`, `departmentId`, `year`, `month`.

Verifikasi: `npm run verify:quality` (32 assert).

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

### Penugasan KPI — sudah selesai

Empat halaman (`head/penugasan`, `head/penugasan/new`, `hr/assignments`,
`hr/assignments/new`) pindah ke `/api/assignments` + `/api/kpi-settings`.

Endpoint baru: `GET /api/assignments?scope=managed`,
`GET /api/users?scope=managed`, `GET /api/kpi-settings?scope=managed`.

Yang ditemukan:

1. **Head bisa menugaskan & membatalkan KPI divisi mana pun.** formerly
   `kpi_assignments` ditulis langsung dari browser dengan `.eq("id", ...)`.
   Tidak ada cek divisi sama sekali — hanya dengan mengubah `id`, Head bisa
   membatalkan penugasan orang lain. Sekarang `POST`/`PATCH` menolak
   assignment di luar `managed_departments` aktornya.
2. **`department_id` dicari dari NAMA divisi.** Kalau nama divisi berubah atau
   dobel, assignment tersimpan tanpa divisi dan tidak muncul di filter mana
   pun. Sekarang dibaca dari `users.department_id`.
3. **Bulk import untuk bulan lain menulis ke bulan yang salah.** `year`/`month`
   dibaca dari `body` yang berupa array → `undefined` → jatuh ke bulan
   berjalan. Tidak ada error. Sekarang `{ year, month, rows }`.
4. **Periode assignment tidak boleh beda dari periode KPI.** `kpis.monthlyTarget`
   di-recalc dari SUM seluruh assignment KPI itu tanpa filter periode, jadi
   satu assignment salah bulan merusak angka target KPI. Sekarang ditolak
   dengan pesan yang menyebut periodenya.
5. **Dua request terpisah: insert lalu aktifkan KPI draft.** Kalau yang kedua
   gagal, KPI tetap draft padahal assignment aktif — dan form menyaring KPI
   draft, jadi user tidak tahu kenapa KPI-nya tidak muncul. Sekarang satu
   operasi di DAL.
6. **Skor tim Head diam-diam salah.** Halaman Head memakai
   `useAllKpiSettings` (scope=all) yang menolak Head dengan 403, lalu
   `getWeights()` mengembalikan DEFAULT_WEIGHTS (50/30/20) — bukan bobot yang
   benar-benar disetel HR. Tidak ada error, hanya angka yang beda.

Verifikasi: `npm run verify:assignments` (70 assert).

---

### Laporan bug (`developer/feedbacks` + `FeedbackModal`) — sudah selesai

Fitur ini **tidak pernah menyimpan satu laporan pun** sejak migrasi.
Schema Drizzle memodelkan `feedbacks` sebagai "catatan untuk satu
assignment KPI" dengan `assignment_id NOT NULL` — tapi tidak ada kode
yang memakainya, dan `user_name` / `department` / `role` / `type` tidak
pernah ada sebagai kolom.

`FeedbackModal` mengirim kelima kolom itu, jadi insert selalu gagal.
Tidak terlihat: stub `createClient()` membalas `error: null`, jadi modal
menampilkan "Laporan berhasil dikirim!" lalu menutup.

Endpoint baru: `GET/PATCH /api/feedbacks` (developer only),
`POST /api/feedbacks` (semua user). Nama/divisi/role sekarang diambil
server dari baris `users` — sebelumnya dikirim dari `AuthContext` dan
bisa dipalsukan.

Verifikasi: `npm run verify:feedbacks` (39 assert).

---

### Riwayat input harian (`tim/history`) — sudah selesai

Tiga hal yang ditemukan:

1. **`userId` dari client bisa membuka laporannya orang lain.**
   formerly `targetUser ?? (privileged ? undefined : me.id)` — kalau
   client mengirim `userId`, `targetUser` selalu terisi, jadi cek
   `privileged` sama sekali tidak dipakai. Staf biasa cukup mengubah
   query string.
2. **Koreksi nilai tidak menyentuh `kpi_assignments`.** formerly
   `daily_reports.update(...)` dari browser, dan `actual_total`
   di-recalc hanya saat laporan dibuat — bukan saat dikoreksi. Angka di
   riwayat dan angka yang dipakai rekap jadi berbeda.
3. **Koreksi tanpa cek kepemilikan.** `.eq("id", id)` tanpa verifikasi
   pemilik — cukup menebak id, staf biasa bisa mengubah laporannya
   orang lain.

Endpoint baru: `PATCH /api/daily-reports`.

Verifikasi: `npm run verify:reports` (35 assert).

---

## `working_days_elapsed` tidak pernah diisi — bug yang paling senyap

Kolom `kpi_assignments.working_days_elapsed` **tidak pernah ditulis di
mana pun** — tidak ada trigger, tidak ada kode. Default-nya 0.

Rantai akibatnya: `expectedTotal = monthlyTarget / workingDaysTotal *
workingDaysElapsed` → `expectedTotal` selalu 0 → `pacePct` selalu 0 →
**`achievementPercentage` untuk KPI bertipe `result` dan `activity`
selalu 0**, berapa pun laporan harian yang sudah diisi.

Tidak ada error, tidak ada warning. Tampilannya rapih, angkanya nol.

Sekarang dihitung dari periode assignment + tanggal hari ini, dan ditulis
balik ke kolom (termasuk `working_days_remaining`) karena halaman lain
membacanya langsung dari database.

Seed lokal diperluas: KPI bertipe `result` + `activity`, 6 laporan
harian, dan `working_days_total` terisi — sebelumnya nol semua, jadi
`/dashboard/tim/history` dan `/dashboard/hr/kpi` tidak punya apa pun
untuk ditampilkan.

---

## Migrasi 0010 — SUDAH ADA, belum di VPS

File: `drizzle/0010_unique_constraints.sql`. Sudah diuji di database lokal:
tidak ada duplikat, keempat constraint terpasang.

`departments.name` **tidak punya UNIQUE** (hanya PK `id`). Sama untuk
`office_locations.name`, `letter_types.code`, dan kombinasi
`kpis(title, year, month)`.

Dampak: dua admin bisa membuat divisi "TNT" dua kali. Dropdown filter KPI
jadi ambigu, `department_locations` bisa menunjuk divisi yang salah.

`kpis.title` sengaja **tidak** di-unique-kan: judul KPI memang boleh sama
antar bulan ("Kualitas Absensi" muncul tiap bulan). Yang unik adalah
kombinasi dengan periode.

⚠️ Di VPS: jalankan bagian 1 (hanya laporan duplikat) dulu dan **periksa
hasilnya** sebelum bagian 2. Kalau bagian 1 melaporkan duplikat, jangan
lanjut — lapor, jangan drop data.

---

## Migrasi 0011 — SUDAH ADA, belum di VPS

`ALTER TABLE kpis ADD COLUMN IF NOT EXISTS brand varchar(64);`

Menambahkan kolom yang sudah lama dibaca halaman `executive/quality` tapi
tidak pernah ada di schema Drizzle.

## Migrasi 0012 — SUDAH ADA, belum di VPS

Memperbaiki tabel `feedbacks`. Baca file `drizzle/0012_feedbacks.sql` —
bagian 1 hanya melaporkan apakah ada baris yang memakai `assignment_id`,
bagian 2 menambahkan kolom dan memasang CHECK constraint.

Intinya: kolom `user_name` / `department` / `role` / `type` ditambahkan,
`assignment_id` dibuat nullable, dan baris lama (bila ada) diisi ulang
dari tabel `users`.

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