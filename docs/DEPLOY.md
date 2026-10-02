# Runbook Deploy — NovaCore HR

Semua yang perlu diketahui sebelum deploy ke VPS. Baca `docs/STATUS.md`
untuk status migrasi, `AGENTS.md` untuk jebakan teknis.

> Credential, password, dan URL produksi **tidak** ada di file ini.
> Ambil dari Coolify saat deploy.

---

## 1. Lingkungan — apa yang ada di VPS

| Fungsi | Cara cari |
|---|---|
| Container aplikasi | `docker ps --format '{{.Names}}' \| grep rredcbao7tqz34pkqeelf8xx` |
| Container database | `vlu8rdt1abda7g69vbiwsk4p` — ⚠️ ada **DUA** postgres, lihat §1.1 |
| Coolify | container `coolify` |

### 1.0 Dua hal yang berubah sendiri tanpa memberi tahu

#### Coolify auto-deploy setiap `git push`

Tidak ada langkah deploy manual. setiap kali commit masuk ke `main`,
Coolify membangun image dan mengganti container-nya sendiri.

Konsekuensi:

- **Tidak ada "deploy nanti"**. Push = produksi berubah beberapa menit
  kemudian. Kalau tidak siap, jangan push.
- **Nanti ingin deploy = sudah ter-deploy.** Langkah "deploy aplikasi"
  di `docs/STATUS.md` sebenarnya sudah terjadi.
- Image tag = SHA lengkap commit yang berjalan. Cara cek versi yang
  aktif tanpa menebak:

  ```bash
  APP=$(docker ps --format '{{.Names}}' | grep rredcbao7tqz34pkqeelf8xx | head -1)
  docker inspect "$APP" --format '{{.Config.Image}}'
  ```

  Bandingkan dengan `git log --oneline -1`. Kalau bedanya, build
  masih jalan atau gagal.

#### Nama container aplikasi berubah tiap deploy

Prefix tetap, sufiks numerik tidak:

```
rredcbao7tqz34pkqeelf8xx-013850109242   ← lama
rredcbao7tqz34pkqeelf8xx-060636430958   ← sekarang
```

Hardcode nama lengkap = `Error response from daemon: No such
container`, padahal aplikasinya sehat dan sedang berjalan. Gejalanya
mirip server mati, jadi wasting time yang tidak perlu.

**Selalu cari by prefix, jangan hardcode:**

```sh
APP=$(docker ps --format '{{.Names}}' | grep "^rredcbao7tqz34pkqeelf8xx" | head -1)
```

Semua skrip di `/usr/local/bin/novacore-*` sudah begitu.

### 1.1 Dua container postgres

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
`db_hr_system` hanya ada di container yang benar, jadi nama database itu
sudah jadi penanda yang cukup.

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

Tidak ada perintah deploy manual — **push ke `main` memicu Coolify
otomatis** (§1.0). Jadi urutan sebenarnya adalah: periksa dulu, baru
push, lalu tunggu.

### 3.1 Sebelum push

```bash
npm run verify          # typecheck + stub guard + test
npm run verify:build    # build + pastikan middleware ter-build
npm run verify:docs     # dokumentasi tidak berbohong tentang diri sendiri
git status              # pastikan tidak ada .env / file sensitif
```

`verify:build` wajib. `next build` **tidak pernah gagal** kalau
middleware hilang — dia hanya menulis `middleware: {}`. Build hijau,
proteksi route hilang tanpa jejak. Lihat `AGENTS.md` §3.1.

**Sebelum push, remember:** ini menyentuh produksi. Kalau ragu, jangan
push dulu — tidak ada yang bisa membatalkan deploy yang sudah terjadi.

### 3.2 Setelah deploy, cek health

Sekali jalan:

```powershell
ssh vps "cat /usr/local/bin/novacore-public-check | sh"
```

Yang benar di produksi:

| Cek | Harus |
|---|---|
| `/api/health` | `"status":"ok"`, `"db":"connected"`, `hostMatchesAuthUrl: true` |
| `/` dan `/login` | HTTP 200 |
| `/absensi/home` tanpa sesi | HTTP 302 (redirect ke login) — **bukan** 200 |
| `/api/me`, `/api/kpis`, `/api/payroll`, dll tanpa sesi | HTTP **401** — bukan 500 |
| `/_next/static/css/*.css` | `content-type: text/css` — **bukan** `text/plain` |

Tiga jebakan di tabel itu:

1. **`status: "warning"` dari dalam container itu normal.** Kalau dicek
   lewat `127.0.0.1:3000`, host-nya berbeda dari `AUTH_URL`, jadi
   `/api/health` melaporkan warning. Itu bukan masalah. Dicek lewat
   domain publik, hasilnya `"status":"ok"`.
2. **401 itu kabar baik.** Endpoint terproteksi mengembalikan 401 dengan
   pesan Bahasa Indonesia = middleware + guard Auth.js hidup. Kalau 500,
   baru ada masalah.
3. **CSS `text/plain` = build menabrak dev server** (§3.12 di
   `AGENTS.md`). Di produksi tidak mungkin terjadi, tapi kalau pernah
   melihatnya, build-nya memang bentrok.

### 3.3 Kalau deploy gagal

Coolify tidak memberi tahu lewat chat. Cek:

```bash
docker ps --filter 'name=rredcbao7tqz34pkqeelf8xx' --format '{{.Names}} {{.Status}}'
docker logs --since 15m <container> | tail -50
```

Kalau tidak ada container yang jalan, build-nya gagal. Build di VPS cuma
2 vCPU, jadi build yang berat bisa kehabisan waktu.

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

### Status migrasi di VPS (per 2026-10-02, sudah diverifikasi)

```
0000_init                  26 tabel                       ✅
0004_auth_constraints      ✅
0005_seed                  3 divisi, 3 letter_types     ✅
0006_kpi_settings_weights  ✅
0007_users_religion        users.religion ada           ✅
0008_letter_numbering      letter_types.template_url
                           + 2 index company_letters    ✅
0009_users_employment      users.employment_status ada  ✅
0010_unique_constraints    4 constraint UNIQUE terpasang ✅
0011_kpis_brand            kpis.brand ada                ✅
0012_feedbacks             4 kolom + 2 CHECK + NOT NULL  ✅
0013_payroll_columns       2 kolom baru                 ✅
```

**Tidak ada yang tertunda.** Kalau menambah migrasi baru, tambahkan
juga ke daftar ini **dan** ke `AGENTS.md` §5 — registri di sini manual,
dan `0009` pernah terlewat karena tidak masuk daftar.

Bukti constraint 0010 benar-benar bekerja (bukan cuma ada di katalog):
mencoba insert divisi "TNT" kedua ditolak dengan
`duplicate key value violates unique constraint "departments_name_unique"`.
Data tetap 3 divisi.

---

### 4.0 Cara memanggil perintah di VPS — jebakan yang sempat membuang waktu

Pemanggilan lewat harness shell lokal merusak perintah yang
mengandung `bash`. Gejalanya **salah total**:

```
Warning: Identity file /root/.ssh/id_vps not accessible
root@168.231.118.146: Permission denied (publickey).
```

Terlihat seperti kunci SSH ditolak, padahal kuncinya tidak pernah
dibaca. Penyebabnya bukan SSH: perintah yang mengandung `bash`, atau
yang menjalankan sebuah file sebagai perintah remote, diinterupsi
harness — yang lalu memanggil ssh dengan argumen kacau. Di mesin ini
`bash` = WSL, dan WSL tidak punya distro terpasang.

| Bentuk | Hasil |
|---|---|
| `ssh vps hostname` | ✅ |
| `ssh vps "cat X \| sh"` | ✅ |
| `ssh vps "cat X \| bash"` | ❌ |
| `ssh vps bash /path/x.sh` | ❌ |
| `ssh vps /path/x` | ❌ |

Aturan: **`cat file | sh`, dan `sh` saja.** Skrip yang dikirim ke VPS
karena itu harus POSIX `sh`: tanpa `set -o pipefail`, tanpa `<<<`,
tanpa array.

Host `vps` sudah terdaftar di `~/.ssh/config` dengan path absolut
(`C:/Users/Banzilla/.ssh/id_vps`) — bukan `~/`, karena `HOME` kosong
di mesin ini dan Windows OpenSSH jailedalu ke `/root/.ssh/`.

### 4.0.1 Skrip yang sudah tersimpan di VPS

Sumbernya ada di repo sebagai `scripts/vps/`, dan sudah ter-copy ke
`/usr/local/bin/` di VPS dengan nama `novacore-*`.

```powershell
# refresh salinan di VPS (ulangi setiap skrip diubah).
# Nama file di kiri HARUS sama persis dengan yang ada di scripts/vps/.
scp scripts/vps/vps-inspect.sh           vps:/usr/local/bin/novacore-inspect
scp scripts/vps/vps-verify-migrations.sh vps:/usr/local/bin/novacore-verify
scp scripts/vps/vps-health.sh            vps:/usr/local/bin/novacore-health
scp scripts/vps/vps-public-check.sh      vps:/usr/local/bin/novacore-public-check
scp scripts/vps/vps-apply-migrations.sh  vps:/usr/local/bin/novacore-apply-migrations
```

Menjalankannya:

```powershell
# read-only, aman kapan saja
ssh vps "cat /usr/local/bin/novacore-inspect | sh"        # kondisi DB
ssh vps "cat /usr/local/bin/novacore-verify | sh"         # verifikasi constraint
ssh vps "cat /usr/local/bin/novacore-health | sh"         # health + versi aktif
ssh vps "cat /usr/local/bin/novacore-public-check | sh"   # cek via domain publik

# MENUBAH database -- hanya untuk migrasi
ssh vps "cat /usr/local/bin/novacore-apply-migrations | sh"
```

| Skrip | Mengubah DB? |
|---|---|
| `novacore-inspect` | tidak |
| `novacore-verify` | tidak (percobaan insert di dalam transaksi yang di-rollback) |
| `novacore-health` | tidak |
| `novacore-public-check` | tidak |
| `novacore-apply-migrations` | **ya** -- hanya untuk migrasi |

Dua hal yang mudah terlewat:

1. **Setelah `scp`, selalu `chmod +x`** dan buang `\r`. File dari
   Windows berakhiran CRLF; `sh` akan gagal membacanya dengan galat
   yang arahnya keliru -- bukan ke masalah line ending.
2. **`novacore-verify` menjalankan percobaan insert** (divisi duplikat)
   di dalam transaksi yang sengaja di-rollback. Itu satu-satunya cara
   membuktikan constraint benar-benar bekerja, bukan cuma tercatat di
   katalog -- tapi kalau setelahnya jumlah baris berubah, jangan
   mengira migrasi yang salah.

### 4.1 Menjalankan migrasi

```powershell
# 1. salin file ke VPS
scp "drizzle\0013_payroll_columns.sql" vps:/root/migrations/

# 2. jalankan seluruh set (0010 per bagian, lalu 0011-0013)
ssh vps "cat /usr/local/bin/novacore-apply-migrations | sh"
```

Untuk satu file:

```powershell
ssh vps "cat /root/migrations/0013_payroll_columns.sql | docker exec -i vlu8rdt1abda7g69vbiwsk4p psql -U postgres -d db_hr_system -v ON_ERROR_STOP=1"
```

`docker exec -i` wajib (stdin), `-v ON_ERROR_STOP=1` supaya berhenti di
error pertama — bukan melanjutkan ke baris berikutnya dengan state
setengah.

### 4.2 Migrasi bercabang (0010 & 0012) — SUDAH DIJALANKAN

0010 bagian 1 = laporan duplikat, bagian 2 = pasang constraint.
Hasil di produksi: **0 baris di semua query** → aman lanjut. Keempat
constraint sekarang terpasang.

0012 bagian 1 = laporan pemakaian `assignment_id`, bagian 2 = ubah
kolom + constraint. `feedbacks` kosong di produksi, jadi tidak ada
baris lama yang perlu diisi ulang.

Skrip `novacore-apply-migrations` menjalankan 0010 **dua kali** untuk
membuktikan idempotensinya — keduanya bersih.

### 4.3 `0013_payroll_columns` — SUDAH DIJALANKAN

Menambah dua kolom ke `payrolls`:

| Kolom | Kenapa |
|---|---|
| `deduction_notes` | `publishRow()` mengirimnya, tapi kolomnya **tidak pernah ada** — jadi tanpa 0013, slip gaji tidak bisa dipublikasikan sama sekali. |
| `system_overtime_days` | Ada di `src/types/index.ts` dan dihitung di halaman, tapi **tidak pernah dikirim** dalam payload apa pun — nilainya hilang setiap kali halaman dimuat ulang. |

Idempotent (`ADD COLUMN IF NOT EXISTS`). Kalau dijalankan ulang akan
muncul `NOTICE: column ... already exists, skipping` — itu **bukan**
error, itu buktinya migrasi sudah jalan.

### 4.4 Nama constraint KPI: `kpis_title_period_unique`

Catatan lama menyebut `kpis_title_year_month_unique`. **Nama itu tidak
pernah ada.** Verifikasi yang mencari nama salah akan melaporkan
"constraint hilang" padahal terpasang — dan itu terjadi saat migrate.
Selalu cek `pg_constraint` langsung.

### 4.5 Verifikasi (READ-ONLY, aman)

```powershell
ssh vps "cat /usr/local/bin/novacore-inspect | sh"   # laporan kondisi DB
ssh vps "cat /usr/local/bin/novacore-verify | sh"    # verifikasi pasca-migrasi
```

`novacore-verify` termasuk mencoba insert divisi duplikat di dalam
transaksi yang di-rollback — satu-satunya cara membuktikan constraint
benar-benar bekerja, bukan cuma tercatat di katalog.

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
npm run verify:endpoints      # 24 assert
npm run verify:quality        # 32 assert
npm run verify:assignments    # 70 assert
npm run verify:feedbacks      # 39 assert
npm run verify:reports        # 65 assert
npm run verify:adminkpi       # 64 assert
npm run verify:hrkpi          # 123 assert
npm run verify:overtime       # 76 assert
npm run verify:payroll        # 84 assert
npm run verify:stubguard      # 10 assert
npm run verify:docs           # 32 assert (butuh dev server hidup)
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
