# Menjalankan Aplikasi Lokal dengan Data Uji

Tujuan: bisa memverifikasi functionality (nilai yang tampil, tombol
Simpan menulis) **tanpa menyentuh data produksi**.

- Database `hr_local_test` di Postgres lokal PC
- - Nol akses ke database VPS
- - `AUTH_SECRET` terpisah, jadi cookie lokal tidak valid di VPS
- - Semua data sintetis

---

## 1. Prasyarat

PostgreSQL 18 lokal harus jalan (Service `postgresql-x64-18`).

Role `hrtest` sudah dibuat. Kalau belum:

```powershell
& "$env:LOCALAPPDATA\Temp\opencode\local-db-admin.ps1"
```

Skrip itu melonggarkan autentikasi loopback **sejenak**, memberi role
`hrtest`, lalu mengembalikan `pg_hba.conf` seperti semula. Aman dijalankan
berulang kali.

---

## 2. Siapkan database (reset total)

Reset pakai `DROP DATABASE` + `CREATE`, jadi butuh `CREATEDB` untuk
`hrtest`. Kalau belum punya hak itu, pakai `TRUNCATE` (lihat bagian 6).

```powershell
cd C:\Users\Banzilla\Documents\DEV\hr-system-vps\Task-Management-NovaCore

$env:PGPASSWORD = 'hrtest_local_only'
$psql = "C:\Program Files\PostgreSQL\18\bin\psql.exe"

& $psql -h 127.0.0.1 -U hrtest -d postgres -c "DROP DATABASE IF EXISTS hr_local_test WITH (FORCE);" -c "CREATE DATABASE hr_local_test OWNER hrtest;"

# Migrasi — WAJIB semua, urut. 0009 sering kelewat.
foreach ($f in @('0000_init','0004_auth_constraints','0005_seed','0006_kpi_settings_weights','0007_users_religion','0008_letter_numbering','0009_users_employment')) {
  & $psql -h 127.0.0.1 -U hrtest -d hr_local_test -v ON_ERROR_STOP=1 -q -f "drizzle\$f.sql"
}

# Data uji
& $psql -h 127.0.0.1 -U hrtest -d hr_local_test -v ON_ERROR_STOP=1 -q -f scripts\seed-local-test.sql

Remove-Item Env:\PGPASSWORD
```

Cek jumlah tabel harus 26:

```powershell
$env:PGPASSWORD='hrtest_local_only'
& $psql -h 127.0.0.1 -U hrtest -d hr_local_test -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"
Remove-Item Env:\PGPASSWORD
```

> Catatan: `NOTICE: column ... already exists, skipping` itu **normal**.
> Migrasi sengaja idempotent. Yang bahaya itu `ERROR:`.

---

## 3. Jalankan app

```powershell
npx next dev -p 3100
```

`.env.local` sudah mengarah ke database uji. Cek:

```
http://localhost:3100/api/health
```

Warning `AUTH_URL memakai http://` dan `hostMatchesAuthUrl: false` itu
**wajar** di lokal. Yang penting `"db": "connected"`.

---

## 4. Login tanpa Google OAuth

Session Auth.js = JWE terenkripsi dengan `AUTH_SECRET`. Cookie itu bisa
dibuat ulang secara lokal:

```powershell
node scripts/local-dev-session.mjs u-hr-001
```

Lalu buka `http://localhost:3100/login` di browser, pasang cookie-nya di
Console:

```js
document.cookie = "authjs.session-token=<TOKEN_TADI>; path=/; max-age=28800; SameSite=Lax";
```

Lalu buka halaman yang mau diuji.

### Kalau cookie-nya diabaikan — pakai 127.0.0.1

Symptomnya: cookie **berhasil ditulis** (`document.cookie` menampilkannya),
`/api/auth/session` tetap `null`, dan setiap navigasi menghapus lagi
cookienya. Handle logout pun tidak menyelesaikannya.

Penyebabnya cookie `authjs.session-token` yang **httpOnly** masih ada di
profile browser. JavaScript tidak bisa membaca atau menimpanya, jadi
browser mengirim yang lama — yang sudah tidak berlaku — lebih dulu.
`withAuth`/`auth()` lalu menghapusnya, dan siklusnya berulang.

Solusi: buka `http://127.0.0.1:3100/login` (bukan `localhost`). Cookie
berpindah domain, jadi cookie	httpOnly yang tersisa tidak ikut terkirim.
Dev server mendengarkan semua interface, jadi cara ini selalu bisa.

Alternatif kalau ini tidak berhasil: hapus data situs untuk `localhost`
lewat browser, atau pakai profile/incognito baru.

> Untuk **server** (`curl`, `node fetch`) ini bukan masalah — hanya
> browser yang punya cookie	httpOnly. Kalau `node` bisa membaca sesi tapi
> browser tidak, penyebabnya di sini, bukan di token.

### User uji

| Id | Peran | Untuk menguji |
|---|---|---|
| `u-hr-001` | HRD, absensi admin, kpiRole `hr` | Semua halaman admin |
| `u-exec-001` | Executive | Batas role atas |
| `u-head-001` | Head of Division | Soping divisi |
| `u-dev-001` | Developer | Role developer |
| `u-staff-001` | Staf biasa, divisi TNT | Halaman staf, harus TIDAK bisa akses admin |
| `u-staff-003` | Kontrak berakhir 2026-12-31 | Badge "Kontrak H-n" |
| `u-pending-001` | Status `pending` | Badge tab "Baru" |
| `u-hidden-001` | `is_hidden = true` | Ghost mode |

> Untuk menguji pembatasan akses, ganti cookie dengan id staf biasa lalu
> coba buka `/absensi/admin/*`. Harus **403 atau redirect**, bukan 200.

---

## 5. Data uji yang sengaja dibuat

| Data | Tujuan |
|---|---|
| `Bayu Saputra` 25 menit telat + alasan `pending` | Tab Denda & approval terlambat |
| `Nadia Putri` status `pending` | Badge tab "Baru" di halaman staf |
| `Hantu Tak Terlihat` `is_hidden=true` | Ghost mode — harus tidak muncul di rekap |
| 3 hari absensi terakhir | Kalender tim & rekap dashboard admin |
| 1 cuti approved + 1 sakit + 1 WFA pending | Pengajuan & approvals |
| 1 surat resmi `001/PKL/HR-TNT/X/2026` | Penomoran surat |
| 2 pengajuan overtime `pending` | Uji setelah Fase 4c |

---

## 6. Reset cepat (tanpa perlu superuser)

Kalau tidak punya `CREATEDB`, truncate saja:

```powershell
$env:PGPASSWORD='hrtest_local_only'
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h 127.0.0.1 -U hrtest -d hr_local_test -c "
TRUNCATE absensi_logs, attendance, company_letters, department_locations,
         holidays, kpi_assignments, kpi_settings, kpis, leave_requests,
         office_locations, overtime_requests, users, departments
RESTART IDENTITY CASCADE;"
Remove-Item Env:\PGPASSWORD
```

Lalu jalankan `drizzle/0005_seed.sql` + `scripts/seed-local-test.sql`
lagi (migrasi tidak perlu diulang).

---

## 7. Yang tidak bisa diuji lokal

| Area | Alasan | Siapa yang menguji |
|---|---|---|
| Geolokasi / GPS check-in | Butuh izin browser + lokasi fisik | Anda |
| Tampilan di HP / iOS | Butuh device | Anda |
| Notifikasi email | Belum ada fiturnya | — |
| Integrasi R2 | Belum ada | — |

Selain itu, semua bisa diuji sendiri.