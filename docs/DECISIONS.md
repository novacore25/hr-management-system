# Keputusan Arsitektur

Kenapa pilihan ini dibuat, dan apa yang dikorbankan. Kalau suatu saat
sesuatu perlu diubah, baca dulu bagian ini supaya tidak mengulang
percobaan yang sama.

---

## 1. Otorisasi di server (DAL), bukan RLS

**Pilihan:** semua cek izin di `src/server/dal/guards.ts`.

**Alasan:** RLS Supabase yang lama bocor di beberapa tempat:
- `payrolls` memakai `USING (true)` — semua orang bisa baca semua gaji
- RPC leaveapprove/leave-reject `SECURITY DEFINER` tanpa cek admin
- `/absensi/admin/**` tidak dijaga sama sekali di sisi database

Semua query sudah lewat DAL sekarang, jadi RLS tidak menambah nilai —
cuma menambah tempat kebenaran kedua yang bisa tidak sinkron.

**Dampak:** menambah endpoint baru wajib memanggil guard. Kalau lupa,
`withAuth` minimal menolak request tanpa session.

---

## 2. Session JWT, bukan database

**Pilihan:** `strategy: "jwt"`, `maxAge` 8 jam, dideklarasikan hanya di
`src/server/auth-config.ts` (dipakai bersama middleware + app).

**Alasan:** dua alasan yang saling mengunci:

1. **Middleware tidak bisa pakai database.** Middleware = edge runtime
   tanpa adapter dan tanpa koneksi Postgres. Token database yang opaque
   mustahil di-resolve di sana.
2. **Split-brain berbahaya.** Kalau app dan middleware beda strategi, keduanya
   menulis cookie `authjs.session-token` dengan nama sama tapi format
   beda. Middleware gagal decode → anggap belum login → bounce ke
   `/login`. Ini benar-benar terjadi dan wasting satu siklus deploy.

**Dikorbankan:** sesi tidak bisa dicabut dari server. Tidak ada "logout
semua perangkat" instan. Cookie lama tetap valid sampai kedaluwarsa
walaupun akunnya dihapus atau `absensi_status` diubah jadi `deleted`.

**Mitigasi:** `maxAge` diturunkan 12 jam → 8 jam. Kalau nanti butuh
revocation, tambahkan kolom `sessions_revoked_at` di `users` lalu
periksa di DAL — **jangan** kembalikan ke database session tanpa
mempertimbangkan ulang masalah split-brain.

**Tabel `sessions`** sekarang tidak terpakai. Dibiarkan karena tidak
merusak dan berguna kalau keputusan ini ditinjau ulang.

---

## 3. Polling 30 detik, bukan Realtime

**Pilihan:** `useApiQuery` dengan `pollMs` default 30 detik + refresh
saat tab regain focus.

**Alasan:** Supabase Realtime butuh kanal yang terbuka terus-menerus per klien.
Di VPS 2 vCPU itu boros, dan butuh Lisensi untuk volume tinggi kalau
skalanya naik.

**Dikorbankan:** "realtime" jadi "maksimal 30 detik stale". Untuk absensi
ini cukup — tidak ada keputusan yang bergantung pada data < 30 detik.

`usePolling` di `src/lib/use-polling.ts` juga handle `visibilitychange`.

---

## 4. `output: "standalone"` + skip type-check saat build

**Pilihan:** Dockerfile multi-stage, `output: "standalone"`,
`typescript.ignoreBuildErrors: true`, `eslint.ignoreDuringBuilds: true`.

**Alasan:** build di VPS cuma 2 vCPU. Type-check + linteatnyawxRn
30–90 detik CPU murni yang tidak masuk image. Image turun dari ~1,4 GB
(railpack) ke ~250 MB.

**Konsekuensi yang harus diingat:** build **tidak** menangkap error
tipe. Jalankan `npm run typecheck` sebelum `npm run verify:build`.

---

## 5. Guard build untuk middleware

**Pilihan:** `npm run verify:build` + guard `node -e` inline di
Dockerfile yang membaca `middleware-manifest.json`.

**Alasan:** `next build` **tidak pernah gagal** saat middleware hilang.
Dia hanya menulis `middleware: {}`. Build hijau, log kosong, proteksi
route hilang. Ini sudah terjadi sekali.

**Aturan:** kalau guard ini gagal, **jangan deploy**. Perbaiki
lokasinya (`src/middleware.ts`, bukan root) atau rantai import-nya
(jangan menarik `server-only`).

---

## 6. `strategy: "database"` untuk DAL absensi

**Pilihan:** semua logika absensi (lateness, geofence, kuota, konflik
divisi) di server; client hanya mengoleksi lokasi dan menampilkan
hasil.

**Alasan:** validasi client bisa dilewati dengan request langsung. Yang
sudah dipindahkan dan dampaknya nyata:

| Validasi | Dulu bisa dilewati? |
|---|---|
| Maksimal 2 orang cuti/tanggal bila divisi ≥ 3 | ✅ ya |
| Bobot KPI harus total 100 | ✅ ya |
| `achievement_percentage` nilai kualitas | ✅ ya, bisa > 100 |
| Reset penalti saat alasan disetujui | ✅ ya, UI menampilkan berhasil tapi penalti tetap ada |
| Geofence check-in | ✅ ya, koordinat palsu |
| `actor` audit trail | ✅ ya, nama bisa dipalsukan |

**Pola:** client boleh menentukan *tampilan* (misal "anda perlu
mengisi alasan"), tapi angka yang tersimpan selalu dihitung ulang server.

---

## 7. Normalisasi kolom profil

**Pilihan:** pakai kolom yang sudah ada di schema —
`birthPlace` + `birthDate`, `address`, `city`, `province`, `postalCode`,
`phone`, `emergencyName` + `emergencyPhone`.

Bukan yang lama: `ttl` (gabungan tempat+tanggal), `address_ktp`,
`phone_wa`, `emergency_contact`.

**Alasan:** kolom lama **tidak pernah ada** di schema Drizzle. Form
menulis ke sana dan errornya hilang — setiap edit profil diam-diam tidak
tersimpan.

Tambahan: `religion` (nullable) ditambahkan lewat migrasi 0007, dan
`join_date` / `employment_status` / `contract_end_date` lewat 0009.

---

## 8. Penomoran surat

**Pilihan:** urutan per `(company, letter_type_id, year)`, format
`001/ST/HR-TNT/X/2026` — bulan memakai angka Romawi.

**Alasan:** itu yang sebenarnya terjadi di aplikasi lama, tapi
terbentuk-bentuk dan tersebar di beberapa tempat. Sekarang di satu
fungsi (`formatFullNumber` di `src/server/dal/letters.ts`).

**Bug yang ditemukan & diperbaiki:** unique index lama ada di
`(company, year, month, running_number)`. Dua tipe surat berbeda di bulan
yang sama bisa sama-sama dapat `running_number = 1` → insert kedua gagal.
Index dipindah ke `(company, year, letter_type_id, running_number)`
(migrasi 0008).

Race condition `MAX(running_number)` juga dipindah ke server, dengan
retry sampai 3× saat kena unique violation.

---

## 9. Migrasi manual, bukan migration runner

**Pilihan:** file SQL idempotent di `drizzle/`, dijalankan manual via
`docker exec` di VPS.

**Alasan:** Coolify tidak menjalankan migrasi saat build, dan koneksi
database dari build sebenarnya tidak perlu. Manual lebih mudah diaudit.

**Konsekuensi:** mudah **lupa** menjalankan salah satu. Sudah terjadi
sekali — `0009` terlewat. Kalau ada kolom yang "seharusnya tidak ada",
cek daftar migrasi yang dijalankan lebih dulu.

---

## 10. Scoping dari server, bukan dari `AuthContext`

**Pilihan:** setiap filter yang membatasi "user bisa melihat siapa" dibaca
dari database di DAL, bukan dikirim dari browser.

**Alasan:** `AuthContext` adalah state di browser. Nilai `managedDepartments`
di sana bisa diubah Head tanpa tooling apa pun, dan halaman lama memakainya
untuk menentukan `user_id` mana yang ditanyakan — jadi bukan hanya
membaca, tapi juga **menilai** KPI orang lain.

Route Handler menerima `scope=self|managed|all`, dan `managed` berarti
"divisi yang dikelola dari `users.managed_departments` milik aktornya".
Per-property pun diperiksa lagi di DAL (`assertCanScore`) saat menyimpan,
karena pembagian read dan write bisa berbeda.

**Detail yang mudah terlewat:** assignment milik Head sendiri sering tidak
punya `department_id`, jadi filter `IN (divisi)` menyembunyikan KPI-nya
sendiri. Karena itu perlu `OR user_id = aktornya`. Kalau tidak, Head
melihat seluruh tim tapi tidak dirinya sendiri.

## 11. Data asli belum dipindahkan

Keputusan sadar: **direct cutover**, bukan dual-sync.

**Alasan:** aplikasi lama (Supabase/Vercel) tetap jalan untuk user
sampai UI/UX selesai. Menjalankan dua sumber data sekaligus berarti
dua tempat harus konsisten — dan tidak ada tooling untuk itu.

**Yang harus diputuskan sebelum migrasi data:**
- `public.users.id` di Supabase itu UUID, sedangkan Auth.js pakai string
  TEXT. Butuh peta id.
- Tabel `auth.users` tidak ikut; user login ulang dengan Google.
- `session.strategy` sudah JWT, jadi tidak ada sesi lama yang dibawa.
- `users.email` adalah identitas login — harus tetap unik dan cocok
  dengan email Google yang dipakai user.
