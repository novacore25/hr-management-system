# AGENTS.md — Konteks Penting untuk AI Assistant

Baca file ini **sebelum** mengerjakan apa pun di repo ini. Isinya
konteks yang tidak bisa disimpulkan dari kode.

Kalau kamu adalah model baru: empat file ini adalah sumber kebenaran.
Kode berubah, dokumen ini menjelaskan **kenapa** dan **apa yang sudah
salah** sebelumnya.

| File | Isi |
|---|---|
| `AGENTS.md` (ini) | Aturan kerja, jebakan, cara memverifikasi |
| `docs/STATUS.md` | Phase mana yang selesai, apa yang tersisa |
| `docs/DECISIONS.md` | Keputusan arsitektur + alasannya |
| `docs/LOCAL-TESTING.md` | Cara menjalankan app lokal dengan data uji |

---

## 1. Apa proyek ini

NovaCore HR Management System. Next.js 15 (App Router) + Drizzle ORM +
PostgreSQL + Auth.js v5 (Google OAuth). Dhabi Supabase, sekarang
self-hosted di VPS Hostinger (Coolify + Docker).

Migrasi dari Supabase ke VPS **belum selesai** — data asli belum
dipindahkan. Lihat `docs/STATUS.md`.

---

## 2. Aturan kerja yang wajib

### 2.1 Verify dari sisi SERVER, bukan dari UI

Ini pelajaran paling mahal di proyek ini. **"Tidak crash" bukan bukti
berfungsi.**

Contoh nyata: widget check-in menampilkan **"Berhasil Check-In"**
padahal tidak ada satu baris pun tersimpan. Sebabnya stub
`createClient()` membalas `{ data: [], error: null }`, jadi:

```js
const { error } = await supabase.from("attendance").insert({...});
if (error) { /* tampilkan error */ }
// error === null → selalu jatuh ke sini
return { success: true };   // → toast "Berhasil!"
```

Tidak ada error. Tidak ada crash. `tsc` bersih. Build hijau. Log bersih.
Yang memberitahu hanya orang yang benar-benar check-in lalu membuka
dashboard admin.

**Aturan:** kalau soal menulis data, buktikan dengan membaca ulang dari
database. Kalau soal Hitungan, bandingkan dengan query manual.

### 2.2 Jangan percaya kompilator untuk hal struktural

`tsc` lolos untuk file 0 byte. `next build` lolos untuk halaman tanpa
`export default` yang bermasalah. File kosong lolos semua.

Cek struktural yang harus dijalankan:

```powershell
npm run verify          # typecheck + stub guard + test
npm run verify:build    # build + pastikan middleware ter-build
```

Plus cek manual yang invaluable tapi belum di-script:

```powershell
# File .ts/.tsx kosong atau terlalu kecil
git ls-tree -r --long HEAD | ForEach-Object { $p = $_ -split '\s+',5; [pscustomobject]@{ Size=[int64]$p[3]; Path=$p[4] } } |
  Where-Object { $_.Path -match '\.(ts|tsx)$' -and $_.Size -lt 100 } | Format-Table -AutoSize

# Halaman tanpa export default
Get-ChildItem -Recurse -File src\app -Filter 'page.tsx' |
  ForEach-Object { if ((Get-Content $_.FullName -Raw) -notmatch 'export\s+default') { $_.FullName } }
```

### 2.3 Jangan pakai PowerShell untuk mengedit file

`Set-Content`, `-replace`, dan friends pernah menghapus seluruh isi
`src/app/absensi/admin/logs/page.tsx` sampai jadi 0 byte — dan file itu
ter-commit. Gunakan tool edit langsung (`edit` / `write`) yang
menampilkan diff.

Kalau memang harus pakai skrip, pakai Node dengan guard: cek anchor
dulu, tulis `\n` eksplisit, dan abort kalau ada yang tidak cocok.

### 2.4 Jangan menebak
Kalau tidak yakin sebuah kolom/tabel benar-benar ada, cek dulu:

```powershell
Select-String -Path src\db\schema.ts -Pattern 'pgTable\("'
```

Kolom yang dipakai halaman tapi tidak ada di schema = bug senyap yang
nilai 0-nya selalu fallback diam-diam. Sudah ditemukan berkali-kali:
`ttl`, `address_ktp`, `phone_wa`, `emergency_contact`, `join_date`,
`employment_status`, `contract_end_date`, `weight`, `religion`.

---

## 3. Jebakan yang sudah sekali bitten

### 3.1 `next build` TIDAK GAGAL saat middleware hilang

Kalau middleware tidak terdeteksi, Next.js hanya menulis
`middleware: {}` ke `middleware-manifest.json`. Build tetap hijau, nol
baris di log. Proteksi route hilang tanpa jejak.

Dua penyebab yang pernah terjadi di repo ini:

1. **Lokasi file.** Project ini memakai direktori `src/`, jadi Next.js
   mencari middleware di `src/middleware.ts`. Letakkan di root = diabaikan
   tanpa peringatan.
2. **Rantai import.** Middleware = edge runtime. Kalau menarik modul
   yang menyentuh database (`import "server-only"`), build middleware
   gagal — dan lagi-lagi hanya diam-diam.

Aturan: `authConfig` untuk middleware **wajib** tinggal di
`src/server/auth-config.ts` (edge-safe). Jangan pernah import
`@/server/auth` atau `@/db` dari `src/middleware.ts`.

Verifikasi: `npm run verify:build` harus mencetak
`PASS: middleware ter-build`. Ada juga guard inline di Dockerfile.

### 3.2 Strategi sesi harus IDENTIK antara app dan middleware

Ini menyebabkan login bounce: klik "Masuk dengan Google", OAuth sukses,
lalu balik ke `/login`.

Penyebabnya split-brain: app `strategy: "database"` (token acak opaque)
sementara middleware default JWT (harus JWE). Keduanya menulis cookie
`authjs.session-token` dengan nama sama, format beda. Middleware gagal
decode → `auth = null` → anggap belum login → redirect.

Tidak bisa pakai `database` di middleware: edge runtime tanpa adapter
dan tanpa Postgres.

**Sekarang:** `session.strategy` hanya dideklarasikan di
`auth-config.ts` yang dipakai bersama. Jangan declare ulang di
`src/server/auth.ts`.

Konsekuensi JWT: sesi tidak bisa dicabut dari server (`maxAge` 8 jam
sebagai kompensasi).

### 3.3 Aturan Hooks React setelah `return` bersyarat

`/dashboard/hr/quality` punya `return "Akses tidak diizinkan"` SEBELUM
`useState`. Karena `role` baru terisi setelah AuthContext selesai memuat,
render pertama lolos (role `null`) lalu render kedua return lebih awal
→ jumlah hook berubah → React melempar "Rendered fewer hooks than
expected" → **seluruh halaman putih**, untuk semua staf biasa.

Cek: tidak boleh ada `return` antara awal komponen dan pemanggilan
hook terakhir. Pengecekan role dismissed setelah semua hook.

### 3.4 Validasi harus di server

Client-side validation dilewati dengan request langsung. Yang sudah
dipindahkan ke server:

- Batas konflik divisi cuti (max 2 orang/tanggal bila divisi ≥ 3)
- Bobot KPI harus total 100 per grup
- `achievement_percentage` nilai KPI kualitas
- Reset penalti keterlambatan saat alasan disetujui
- `actor` audit trail (sebelumnya dari state client, bisa dipalsukan)
- Geofence check-in (sebelumnya client bisa kirim koordinat palsu)

### 3.5 `ON CONFLICT DO NOTHING` tanpa target tidak mencegah apa pun

Kalau tidak ada constraint yang cocok, tiap insert berhasil. Seed saya
jalankan 7× karena error → 15 baris `departments` dari 5 yang
seharusnya.

Schema yang **tidak punya UNIQUE padahal seharusnya**: `departments.name`,
`office_locations.name`, `kpis.title`, `letter_types.code`.
Lihat `docs/STATUS.md` → migrasi 0010.

---

## 4. Environment

| | Lokal (dev) | VPS (produksi) |
|---|---|---|
| DB | `hrtest@127.0.0.1:5432/hr_local_test` | Coolify internal `db_hr_system` |
| Port | 3100 | 3000 |
| `AUTH_SECRET` | terpisah (`.env.local`, gitignored) | rahasia Coolify |
| Sesi | cookie di-forge oleh `scripts/local-dev-session.mjs` | Google OAuth |

`.env.local` **tidak** pernah di-commit.

### Cara menjalankan lokal

```powershell
npm run verify            # typecheck + stub guard + test
npm run dev               # atau: npx next dev -p 3100
```

Buat sesi tanpa OAuth:

```powershell
node scripts/local-dev-session.mjs u-hr-001
```

Lalu pasang sebagai cookie `authjs.session-token` di `localhost:3100`.
Detail lengkap di `docs/LOCAL-TESTING.md`.

User uji yang tersedia: `u-hr-001`, `u-exec-001`, `u-head-001`,
`u-dev-001`, `u-staff-001`, `u-staff-002`, `u-staff-003`,
`u-pending-001`, `u-hidden-001`.

---

## 5. Migrasi database

File di `drizzle/` **sudah wajib idempotent** (`IF EXISTS` /
`IF NOT EXISTS`), karena dijalankan manual di VPS lewat `docker exec`
bukan lewat migration runner.

Urutan apply: `0000_init`, `0004_auth_constraints`, `0005_seed`,
`0006_kpi_settings_weights`, `0007_users_religion`,
`0008_letter_numbering`, `0009_users_employment`.

⚠️ `0009` pernah terlewat karena tidak masuk daftar manual. Kalau ada
kolom yang seharusnya tidak ada, cek dulu daftar migrasi yang dijalankan.

---

## 6. Gaya kode

- Bahasa Indonesia untuk komentar, pesan error, dan teks UI.
- Server-side authorization di `src/server/dal/guards.ts`. RLS Supabase
  yang lama sudah dihapus.
  Otorisasi berpusat di DAL, bukan tersebar di beberapa tempat.
- Live update: polling 30 detik + refresh saat tab regain focus
  (pengganti Supabase Realtime).
- Jangan tambahkan dependensi baru tanpa alasan kuat — build di VPS
  cuma 2 vCPU.
- Hapus entri dari `ALLOWLIST` di `scripts/verify-no-stub.ts` setiap
  kali file selesai dimigrasi. Jangan pernah menambahkan.

---

## 7. Kalau ada yang aneh

1. `npm run verify` — typecheck, stub guard, test
2. `npm run verify:build` — middleware masih terdeteksi?
3. Cek ukuran file yang baru diedit — `git diff --stat`
4. `[DAL]` -> `[route]` -> `[hook]` -> `[halaman]`, cek setiap layer
5. Kalau status 200 tapi angkanya aneh: cek **isi**, bukan status code

Jangan lewati begitu saja hanya karena "tidak error". Itu cara widget
check-in lolos selama berminggu-minggu.
