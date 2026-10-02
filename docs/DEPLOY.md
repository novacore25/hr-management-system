# Runbook Deploy — NovaCore HR

Semua yang perlu diketahui sebelum deploy ke VPS. Baca `docs/STATUS.md`
untuk status migrasi, `AGENTS.md` untuk jebakan teknis.

> Credential, password, dan URL produksi **tidak** ada di file ini.
> Ambil dari Coolify saat deploy.

---

## 1. Lingkungan — apa yang ada di VPS

| Fungsi | Cara cari |
|---|---|
| Container aplikasi | `docker ps --format 'table {{.Names}}\t{{.Image}}'` lalu cari image `novacore` |
| Container database | **cari yang image `postgres:18-alpine`** — ⚠️ ada **DUA**, lihat §2 |
| Coolify | container `coolify` |

### ⚠️ Dua container postgres

```
vlu8rdt1abda7g69vbiwsk4p   postgres:18-alpine   ← aplikasi HR
kqgwtzqknu9axud1urkau5si   postgres:18-alpine   ← milik aplikasi lain
```

Keduanya image-nya identik. **Selalu verifikasi nama container sebelum
menjalankan query atau migrasi.** Salah pilih = mengedit database yang
tidak dipakai aplikasi, dan tidak ada error — perintahnya tetap berhasil.

Cara memastikan benar:

```bash
docker exec vlu8rdt1abda7g69vbiwsk4p psql -U postgres -d db_hr_system -c "SELECT count(*) FROM users;"
```

Kalau hasilnya 0 (atau tidak ada tabel `users`), itu container yang salah.

---

## 2. Awal: sudah pastikan container, baru query

```bash
# GANTI nama container kalau berubah, jangan asal copy-paste
DB=vlu8rdt1abda7g69vbiwsk4p

docker exec $DB psql -U postgres -d db_hr_system -c "SELECT 1;"
```

Kalau `password authentication failed`:

```bash
PGPW=$(docker exec $DB printenv POSTGRES_PASSWORD)
docker exec -e PGPASSWORD="$PGPW" $DB psql -U postgres -d db_hr_system -c "SELECT 1;"
```

Password hanya disimpan di env container Coolify. **Jangan** menulisnya
ke file mana pun, jangan di-commit, jangan dikirim di chat.

---

## 3. Urutan deploy

### 3.1 Sebelum push

```bash
npm run verify          # typecheck + stub guard + test
npm run verify:build    # build + pastikan middleware ter-build
git status              # pastikan tidak ada .env / file sensitif
```

`verify:build` wajib. `next build` **tidak pernah gagal** kalau
middleware hilang — dia hanya menulis `middleware: {}`. Build hijau,
proteksi route hilang tanpa jejak. Lihat `AGENTS.md` §3.1.

### 3.2 Setelah deploy, cek health

```bash
curl -s https://<APP_DOMAIN>/api/health | head -c 400
```

Yang diharapkan:

```json
{"status":"warning","db":"connected", ...}
```

- `"db":"connected"` → database tersambung
- `"status":"warning"` dengan `problems` soal `AUTH_URL memakai http://`
  → **wajar di lokal**, tapi di produksi harus `https://`
- `"db":"failed"` → cek `DATABASE_URL` di Coolify

---

## 4. Migrasi database

Semua file di `drizzle/` **idempotent** (`IF EXISTS` / `IF NOT EXISTS`),
jadi aman dijalankan berulang kali.

### ⚠️ Dua aturan yang pernah jadi masalah

1. **Jalankan satu per satu, cek output tiap langkah.** Kalau salah satu
   gagal, langkah berikutnya bisa merusak data.
2. **Registri adalah manual, bukan migration runner.** Kalau sebuah migrasi
   tidak masuk daftar di bawah, dia tidak akan pernah dijalankan — dan
   gejalanya adalah "kolom itu seharusnya ada tapi tidak ada".

### Sudah di VPS

```
0000_init
0004_auth_constraints
0005_seed
0006_kpi_settings_weights
0007_users_religion
0008_letter_numbering
0009_users_employment
```

### Belum di VPS (per 2026-10-02)

```
0010_unique_constraints   ← JALANKAN PER BAGIAN, LIHAT §4.1
0011_kpis_brand
0012_feedbacks            ← JALANKAN PER BAGIAN, LIHAT §4.1
0013_payroll_columns
```

### 4.1 Migrasi bercabang (0010 & 0012)

Kedua file ini punya bagian yang harus diperiksa manual sebelum
lanjutan. **Jangan `cat file | docker exec` sekaligus.**

0010:

```bash
# BAGIAN 1 dulu — hanya laporan, tidak mengubah apa pun
docker exec $DB psql -U postgres -d db_hr_system < drizzle/0010_unique_constraints.sql
```

Baca output bagian 1. Kalau ada baris duplikat (kolom `nilai` terisi),
**STOP** — jangan jalankan bagian 2. Duplikat berarti data yang perlu
dibersihkan lebih dulu oleh pemilik sistem. Menjalankan bagian 2 dengan
duplikat akan gagal dan menghasilkan error yang membingungkan.

Kalau bersih (0 baris di semua query), lanjutkan bagian 2.

0012: sama — bagian 1 melaporkan apakah ada baris `feedbacks` yang memakai
`assignment_id`, bagian 2 menambahkan kolom dan constraint.

### 4.2 `0013_payroll_columns` — JALANKAN SEBELUM MIGRASI DATA

Menambah dua kolom ke `payrolls`:

| Kolom | Kenapa |
|---|---|
| `deduction_notes` | `publishRow()` mengirimnya, tapi kolomnya **tidak pernah ada** — jadi kalau tidak ditambah, slip gaji tidak bisa dipublikasikan sama sekali. |
| `system_overtime_days` | Ada di `src/types/index.ts` dan dihitung di halaman, tapi **tidak pernah dikirim** dalam payload apa pun — nilainya hilang setiap kali halaman dimuat ulang. |

Idempotent (`ADD COLUMN IF NOT EXISTS`), jadi aman di produksi:

```bash
docker exec -i $DB psql -U postgres -d db_hr_system -v ON_ERROR_STOP=1 < drizzle/0013_payroll_columns.sql
```

Nanti di bagian paling bawah akan tercetak dua baris:

```
 column_name      | data_type | is_nullable
------------------+-----------+------------
 deduction_notes  | text      | YES
 system_overtime_days | integer | YES
```

Kalau yang muncul `NOTICE: column ... already exists, skipping` — itu
berarti migrasi pernah jalan. Bukan error.

**Penting untuk Fase 6:** kalau ternyata Supabase ternyata sudah punya
kedua kolom ini, `ADD COLUMN IF NOT EXISTS` tidak melakukan apa-apa dan
data yang ada tetap utuh. Kalau ternyata tidak punya, kolomnya dibuat
kosong — dan nilai kosong itu memang tidak pernah tersimpan sebelumnya,
jadi tidak ada data yang hilang.

### Cara menjalankan file dari repo lokal

```bash
DB=vlu8rdt1abda7g69vbiwsk4p
# dari folder repo
docker exec -i $DB psql -U postgres -d db_hr_system -v ON_ERROR_STOP=1 < drizzle/0011_kpis_brand.sql
```

`-i` wajib (stdin), `-v ON_ERROR_STOP=1` supaya berhenti di error pertama
bukan lanjut ke baris berikutnya.

---

## 5. Kalau ada masalah

### Login bounce (kembali ke `/login` terus)

Cek `session.strategy` hanya dideklarasikan di `src/server/auth-config.ts`.
Kalau declare ulang di `src/server/auth.ts`, app dan middleware pakai
format token berbeda untuk cookie yang sama. Lihat `AGENTS.md` §3.2.

### Halaman kosong untuk sebagian user

Kemungkinan besar `return` bersyarat ada sebelum pemanggilan hook —
`role` belum terisi saat render pertama, jumlah hook berubah, React
melempar "Rendered fewer hooks than expected". Cek `AGENTS.md` §3.3.

### Angka tampil 0 padahal datanya ada

Periksa apakah ada kolom yang **tidak pernah diisi** di mana pun. Sudah
ditemukan: `working_days_elapsed` (default 0) membuat
`achievementPercentage` selalu 0. Pola yang sama bisa terjadi di kolom
lain — cari dulu sebelum menebak.

### 403 padahal seharusnya boleh

Bisa jadi scoping. Filter "user bisa melihat siapa" harus dari database,
bukan dari `AuthContext`. Kalau datanya kosong, cek `managed_departments`
user tersebut — bisa jadi kosong sehingga semua query ter-filter habis.

### `docker logs`

`docker logs` mencakup output dari **restart sebelumnya**. Jangan
mengira error yang sudah selesai masih terjadi. Pakai `--since`:

```bash
docker logs <container> --since 10m
```

---

## 6. Verifikasi lokal (sebelum deploy)

```bash
# env lokal
cp .env.example .env.local   # isi DATABASE_URL + AUTH_SECRET
npx next dev -p 3100

# dengan dev server jalan, di terminal lain:
npm run verify:endpoints      # 24 endpoint
npm run verify:quality        # 32 assert
npm run verify:assignments    # 70 assert
npm run verify:feedbacks      # 39 assert
npm run verify:reports        # 35 assert
```

Semuanya membaca **isi** database, bukan cuma status code. Detail cara
menyiapkan database uji ada di `docs/LOCAL-TESTING.md`.

Penting: skrip ini hanya menguji **database uji lokal**. Skrip
lokal yang hijau **tidak menjamin** produksi benar — terutama untuk data
yang bentuknya berbeda. `managed_departments` (nama vs UUID) sudah
menjadi contoh nyata.

---

## 7. Yang TIDAK boleh masuk commit

- `.env`, `.env.local`, `.env.production`
- Password database / AUTH_SECRET / AUTH_GOOGLE_SECRET
- `scripts/local-dev-session.mjs` (buat cookie sesi admin — sudah di-gitignore)
- Dump data produksi

Cek sebelum push:

```bash
git status --short
git diff --cached --name-only | grep -E '\.env|session\.mjs' && echo "BERHENTI"
```
