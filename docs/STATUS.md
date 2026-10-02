# STATUS MIGRASI — dibaca sebelum mengerjakan apa pun

Terakhir diperbarui: setelah lembur & Pengaturan Gaji selesai — tersisa
**2 file** di allowlist stub, keduanya payroll (Phase 5).

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

### Sisa 2 file — payroll (Phase 5)

Allowlist stub: 14 → **2 file**.

| File | Isi |
|---|---|
| `/absensi/admin/payroll` | 1422 baris — Input Gaji: hitung slip, potong lembur, publish |
| `/absensi/(staff)/payroll` | 226 baris — Slip gaji milik staf sendiri |

Server layer-nya sudah ada (`src/server/dal/payroll.ts` +
`/api/payroll`), termasuk `listPayrolls`, `listDeductionTypes`,
`listAdditionTypes`, `countPayrolls`. Yang belum: penulisan `payrolls`
(buat/ubah/publish) dan dua halaman di atas.

**Rekomendasi:** kerjakan sebagai satu batch tersendiri. Ini data gaji —
paling sensitif di aplikasi — dan involves perhitungan yang berdampak ke
uang orang sungguhan.

### Yang sudah selesai di batch ini

- Seluruh halaman `/dashboard/**` dan `/absensi/**` (kecuali 2 payroll).
- Komponen KPI harian (`DailyInputForm`, `DailyActivityFeed`,
  `DailyReportsViewer`).
- Overtime: DAL + endpoint + 4 halaman/komponen.
- Payroll: DAL + endpoint + halaman Pengaturan Gaji.

### Komponen KPI harian — ✅ selesai, enam bug ditemukan

Tiga komponen yang dipakai di 7 halaman sekaligus (`tim`, `tim/kpi`,
`tim/input`, `head`, `hr/activity`, `executive/activity`,
`ExpandableStaffGrid`). Salah satu bug di sini dampaknya ke semua
halaman itu.

1. **Filter divisi mati.** `departmentFilter` ada di state dan ada
   dropdownnya, tapi tidak pernah dipakai di `filteredReports`. User
   memilih divisi, tidak ada yang berubah, tidak ada yang memberitahu.
2. **Judul KPI selalu UUID.** `kpiMap` diisi dari query stub, jadi
   selalu kosong — setiap baris menampilkan `r.kpiId` mentah di tempat
   judulnya.
3. **HR hanya melihat laporannya sendiri** di feed aktivitas admin.
   Hook dipanggil tanpa `scope`, jadi server membatasi ke `me.id` —
   di halaman yang justru dirancang untuk melihat semua orang.
4. **Tidak ada validasi tanggal di server.** Satu-satunya penjaga
   `<input type="date" min max>`. Tanggal masa depan membuat
   `actual_total` sudah mengandung angka yang belum terjadi; tanggal
   salah bulan masuk ke total tanpa pernah tampil di kalender bulan itu.
   Dan check-then-insert adalah race — ada unique index
   `(assignment_id, date)`, jadi dua tab bisa sama-sama lolos lalu
   salah satunya gagal diam-diam.
5. **Pemilik laporan ditentukan client.** `DailyReportsViewer` tidak
   tahu siapa pemiliknya, jadi dulu `userId` dikirim dari state
   browser dan server hanya membandingkannya dengan `me.id`. Sekarang
   server membaca pemiliknya dari `kpi_assignments`, lalu memutuskan:
   pemilik boleh, HR/Executive/Developer boleh semua, Head hanya
   divisinya.
6. **Hapus laporan tanpa cek kepemilikan.** `.eq("id", ...)` dari
   browser — cukup menebak id. Sekarang `DELETE` menerima
   `assignmentId` + `date` dan server memverifikasi lewat assignment.

### `KpiFormPage` — ✅ selesai, empat bug ditemukan

Form buat/edit KPI, dipakai `/dashboard/hr/kpi/{new,edit}` dan
`/dashboard/head/kpi-setup/{new,edit}`.

1. **Setiap KPI tercipta tanpa divisi.** Form mencari id dari NAMA
   (`departments.select("id").eq("name", name)`) lalu memakai
   `deptData?.id ?? null`. Dengan stub hasilnya selalu `null` — jadi
   `department_id` kosong, **tanpa error dan tanpa toast**. KPI-nya ada,
   tapi tidak pernah muncul di halaman Head. Sekarang id dikirim
   langsung dan divalidasi terhadap tabel `departments`.
2. **Edit KPI menimpa target per orang.** Form melakukan
   `kpi_assignments.update({ monthly_target: target }).eq("kpi_id", id)` —
   menulis **total KPI** ke setiap penugasan. Karena
   `kpis.monthlyTarget = SUM(assignment.monthlyTarget)`, totalnya jadi
   n kali terlalu besar dan target tiap orang hilang. Sekarang
   **server menolak** perubahan target kalau KPI sudah punya penugasan
   (409, dengan arah ke Penugasan KPI), dan field-nya dikunci di form.
3. **Daftar divisi Head bocor.** `/dashboard/head/kpi-setup/{new,edit}`
   mengirim `allowedDepartments` dari `AuthContext.user.managedDepartments`
   — Head tinggal mengubahnya di DevTools lalu membuat KPI untuk divisi
   mana pun. Sekarang `GET /api/departments?scope=managed`.
4. **Dropdown Head selalu kosong.** `managedDepartments` berisi **id**
   sedangkan `SelectItem` berisi **nama** — dua format berbeda, tidak
   pernah cocok. Sekarang keduanya id, nama hanya untuk ditampilkan.

Bonus: validasi tipe/unit/periode/target dipindahkan ke server. Dulu
semuanya hanya di form yang bisa dilewati dengan satu request biasa.

### `/dashboard/hr/kpi` — ✅ selesai, enam bug ditemukan

Halaman terbesar, dengan tab Sampah, Restore, Hapus Permanen, dan
"Copy dari Bulan Lalu".

1. **Tab Sampah selalu kosong.** Halaman memakai `useKpis()`, yang
   menyaring `deleted_at IS NULL` **di server**, lalu menghitung
   `kpis.filter(k => k.deletedAt)` di browser. Polanya tidak pernah
   menghasilkan apa pun — jadi Restore dan Hapus Permanen tidak pernah
   bisa dipakai. Sekarang memakai `useKpisIncludingTrash()`
   (`includeTrash=1`).
2. **Restore tidak menghidupkan penugasannya.** Versi DAL hanya
   mengosongkan `deleted_at`. KPI muncul kembali dengan **nol
   penugasan**: tidak ada yang bisa mengisinya, dan tidak ada yang bisa
   melihat bahwa ada yang salah. Sekarang assignment berstatus
   `cancelled` dihidupkan lagi — `completed` sengaja tidak, supaya
   skor final tidak berubah.
3. **Hapus permanen = tiga delete dari browser** (`daily_reports` →
   `kpi_assignments` → `kpis`). Kalau langkah pertama gagal, tersisa
   laporan yatim tanpa KPI induknya. Sekarang satu delete; keduanya
   `ON DELETE CASCADE`. Server juga **menolak** KPI yang belum di-trash
   (409) — penghapusan permanen tidak bisa dibatalkan.
4. **Feature parity: endpoint hapus permanen hanya boleh `executive`**,
   padahal halamannya milik HR — jadi tidak ada yang bisa memakai
   fitur itu. Sekarang `hr` juga boleh; `tim` dan `head` tetap tidak.
5. **Operasi massal = satu request per KPI dalam `for` biasa.** Kalau
   yang ketujuh gagal, enam pertama sudah terlanjur terhapus tapi UI
   tetap menampilkan "berhasil" untuk semuanya. Sekarang `ids: []` ke
   server, dan hasilnya dilaporkan apa adanya.
6. **"Copy dari Bulan Lalu" menduplikasi.** Saringan "sudah ada"
   memakai `k.title + "|" + k.department` — tapi baris Supabase tidak
   punya kolom `department` (yang ada `department_id`), jadi kuncinya
   selalu berakhir `"judul|undefined"` untuk kedua sisi dan yang
   dibandingkan hanya judulnya. KPI dengan judul sama di divisi berbeda
   tetap ikut tersalin. Sekarang kuncinya benar-benar (judul, divisi).

**Bug yang hanya ketahuan karena dicek di browser** — bukan dari API:

`softDeleteKpis` awalnya membatalkan penugasannya dulu, baru
menandai `deleted_at`, lalu menghitung "berapa KPI yang terpengaruh"
dengan filter `deleted_at IS NULL`. Karena penandaan sudah terjadi di
langkah pertama, hasilnya **selalu 0** — dan UI menampilkan
"0 dari 1 KPI dipindahkan, Sisanya tidak berubah" untuk aksi yang
**berhasil**. Caller-nya memakai `?? 0`, jadi nilai yang hilang pun
tidak terlihat. Jalur satu-id punya bug sama: `softDeleteKpi` tidak
mengembalikan jumlah sama sekali.

Pelajaran: **laporan hasil operasi adalah bagian dari functionality.**
Kalau UI menampilkan angka, angka itu harus dihitung dari perubahan
nyata — bukan dari nilai default.

### `hr/employees` + `head/kpi-setup` — ✅ selesai, empat bug ditemukan

Keduanya menulis langsung ke `users` dan `kpis` dari browser. Yang
ketahuan:

1. **`managed_departments` diisi NAMA divisi, bukan ID.** Form memakai
   `useDepartments()` yang mengembalikan `names: string[]`. Semua kode
   server membandingkannya dengan **ID**. Setelah HR menyimpan role
   Head, semua halaman Head kosong — **tanpa error, tanpa toast**, hanya
   hasil yang tidak tampil. Sekarang form memakai `useDepartmentsWithId()`
   dan server memvalidasi tiap id terhadap tabel `departments`.
   Bukti: dialog role menampilkan "TNT" tercentang sementara isinya UUID.
2. **Role bisa diubah siapa saja.** `supabase.from("users").update(...)`
   tidak punya cek role server. URL `/dashboard/hr/employees` bisa
   dibuka siapa pun yang punya sesi — termasuk mengubah dirinya sendiri
   jadi `developer`. Sekarang `PATCH /api/users` mewajibkan
   hr/executive, dan pemberian role `developer` hanya boleh dari
   `developer`.
3. **Head bisa mengubah KPI divisi orang lain.** `kpis.update({status})`
   tanpa cek pemilik; cukup mengirim `id`. Sekarang
   `assertCanManageKpi` membandingkan `kpis.department_id` dengan
   `users.managed_departments` **di server** — sebelumnya daftar divisi
   datang dari `AuthContext`.
4. **Soft delete = dua operasi tanpa cek hasil.** Cancel assignment dulu,
   baru set `deleted_at`. Kalau yang pertama gagal, KPI terhapus tapi
   penugasannya tetap aktif — dan karena KPI-nya tidak tampil lagi,
   penugasan yatim itu tidak pernah terlihat siapa pun. Sekarang satu
   jalur server (`softDeleteKpi` → `cancelAssignmentsForKpi`) yang
   melaporkan jumlahnya.

**Bug bonus yang ditemukan saat memverifikasi** (bukan dari kedua
halaman itu, tapi dari endpoint yang mereka panggil):

- `PUT /api/kpi-settings` menerima **bobot negatif**: `-10 + 60 + 50`
  lolos karena totalnya 100. Validasi sekarang: lima field wajib ada,
  bilangan bulat, 0-100.
- `GET /api/kpi-settings?userId=<tidak ada>` mengembalikan bobot **default**
  seolah-olah itu bobot aslinya. Sekarang 404.
- `GET /api/users?id=<tidak ada>` → `200 {user: null}`. Sekarang 404.
- `?id=` / `?kpiId=` dengan nilai sampah → **500** "Terjadi kesalahan di
  server", karena kolomnya uuid dan formatnya dicek terlalu lambat.
  Sekarang 400 dengan pesan yang bisa dibaca.

---

## Verifikasi

Delapan skrip, **493 assert**, semuanya membaca isi respons dan isi
database — bukan cuma status code.

```powershell
npm run verify:endpoints    # 24  amplop, status, isi data
npm run verify:quality      # 32  scoping, penolakan, nilai tersimpan
npm run verify:assignments  # 70  scoping, validasi, audit trail
npm run verify:feedbacks    # 39  laporan benar-benar tersimpan
npm run verify:reports      # 65  koreksi, kepemilikan, tanggal
npm run verify:adminkpi     # 64  role, divisi, bobot, hapus KPI
npm run verify:hrkpi        # 123 sampah, restore, cascade, bulk, copy, form
npm run verify:overtime     # 76  tahap lembur,-transition, gaji di server
```

Total **493 assert**, delapan skrip.

Semuanya membersihkan data ujinya sendiri dan bisa dijalankan berulang
kali.

`verify:hrkpi` lahir dari halaman yang sama — termasuk assert bahwa
restore benar-benar menghidupkan penugasan, dan bahwa jalur satu-id juga
melaporkan jumlah yang sebenarnya. Bug "0 dari 1 KPI dipindahkan" lolos
dari 79 assert pertama dan hanya terlihat lewat toast di browser.

### `/dashboard/developer/import` — SUDAH DIHAPUS

Halaman Import KPI CSV (660 baris) dihapus atas permintaan pemilik
sistem: tidak ada yang memakainya. Link di Sidebar dihapus, dan
`/dashboard/developer` sekarang mengarah ke `developer/feedbacks`.

Alasan teknis yang ditemukan saat meninjau (berlaku kalau nanti ada fitur
impor baru — jangan mengulang):

1. `.eq("department_id", deptIdByName[dept] ?? "")` — kalau ada baris CSV
   untuk user tanpa divisi (HR, Executive, Head — semuanya `NULL`), nilai
   `""` langsung ditolak Postgres: `invalid input syntax for type uuid`.
   **Seluruh import gagal**, bukan cuma baris itu. Errornya hanya masuk
   `console.error`, jadi user melihat halaman diam.
2. `brand` dikirim ke `kpis` — kolom yang baru ada di migrasi 0011.
3. `working_days_elapsed: 0` — kolom yang tidak pernah diisi (lihat bagian
   `working_days_elapsed` di bawah).
4. Tidak idempoten: impor dua kali akan menjumlahkan `kpis.monthlyTarget`
   dua kali dan menduplikasi assignment.
5. `kpi_assignments` tidak punya UNIQUE di `(kpi_id, user_id, year, month)`,
   jadi tidak ada pengaman duplikasi di database.

Kalau nanti dibangun ulang: **[PENTING] jalankan server-side, validasi
baris-per-baris, dan satu baris yang gagal tidak boleh membatalkan yang
lainnya.** Impor massal tanpa transaksi parsial menghasilkan data setengah
jadi.

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

### Fase 4c — Overtime ✅ selesai

`src/server/dal/overtime.ts` + `/api/overtime` + 4 halaman/komponen.

Alur 4 tahap (`pending → approved/rejected → reported → finalized`)
sekarang ditegakkan **di server**. Dulu `update({ status }).eq("id")`
tanpa cek status lama — approve bisa dijalankan ulang pada pengajuan yang
sudah `finalized`, menimpa gaji yang sudah dibayar.

Yang paling serius: **gaji lembur dihitung di browser**. `total_overtime_pay`
dikirim dari klien apa adanya dan langsung dipakai untuk slip gaji.
Sekarang server yang menghitung (formula Depnaker di
`lib/overtimeHelpers.ts` dipindah ke server); override manual tetap ada
tapi wajib disertai alasan dan tercatat di `calculation_breakdown`.

Verifikasi: `verify:overtime`, 76 assert.

### Fase 4c — Payroll 🟡 sebagian

`src/server/dal/payroll.ts` + `/api/payroll` + halaman Pengaturan Gaji.

**Bug paling serius di proyek ini ditemukan di sini:**
`payroll_staff_settings.upsert(...)` ditulis **langsung dari browser
tanpa cek role sama sekali**. Siapa pun yang punya sesi — termasuk staf
biasa — cukup membuka `/absensi/admin/payroll/settings` lalu mengubah
gaji dasar siapa pun. Angka negatif juga diterima.

Sekarang HR/Executive saja, dengan validasi user target, angka >= 0, dan
perusahaan yang dikenal. Sisa: halaman Input Gaji + Slip Gaji.

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

### Fase 5 — Payroll 🟡 1 dari 3 halaman selesai

Lihat bagian "Sisa 2 file" di atas. Tabel sudah ada (`payrolls`,
`payroll_staff_settings`, `payroll_addition_types`,
`payroll_deduction_types`) dan server layer-nya sudah ada juga.

### Fase 6 — Migrasi data (belum mulai)

`pg_dump` Supabase → transform → load. **Ini yang paling berisiko.**
Yang perlu diputuskan dulu:
- `public.users.id` adalah UUID, sedangkan Auth.js pakai string TEXT.
  Perlu transformasi id.
- Tabel `auth.users` tidak ikut; user harus login ulang dengan Google.
- `session.strategy` sudah JWT, jadi tidak ada sesi lama yang perlu dibawa.

#### Kondisi database produksi per 2026-10-02

Sudah diperiksa langsung di VPS:

```
users total : 1   (role: tim, tanpa managed_departments)
role head   : 0
role hr / executive / developer : 0
```

Artinya **belum ada data asli sama sekali** — sesuai rencana, migrasi data
adalah Fase 6 dan belum jalan. User yang ada adalah akun pemilik sistem
yang lahir saat login Google pertama kali, dengan role default `tim`
(sesuai desain: HR tinggal menaikkan role-nya nanti).

Dua konsekuensi yang perlu diketahui:

1. **Format `managed_departments` belum teruji di produksi.** Kalau Supabase
   menyimpan NAMA divisi (kemungkinan besar — `hr/employees` lama menulis
   dari `useDepartments()` yang mengembalikan nama), kode lama akan
   membandingkannya dengan ID dan hasilnya nol tanpa error. **Saat migrasi,
   nilainya harus ditulis sebagai UUID**, bukan apa adanya.
2. **Halaman yang di-scope ke Head akan kosong di produksi** — bukan bug,
   konsekuensi belum adanya user ber-role `head`. Semua scoping sudah
   diuji dengan data uji lokal.

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