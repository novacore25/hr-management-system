# AGENTS.md — Konteks Penting untuk AI Assistant

Baca file ini **sebelum** mengerjakan apa pun di repo ini. Isinya
konteks yang tidak bisa disimpulkan dari kode.

Kalau kamu adalah model baru: empat file ini adalah sumber kebenaran.
Kode berubah, dokumen ini menjelaskan **kenapa** dan **apa yang sudah
salah** sebelumnya.

| File | Isi |
|---|---|
| `AGENTS.md` (ini) | Aturan kerja, jebakan, cara memverifikasi |
| `docs/DEPLOY.md` | **Runbook deploy ke VPS** — container mana, migrasi mana yang sudah jalan, cara cek health, troubleshooting |
| `docs/STATUS.md` | Phase mana yang selesai, apa yang tersisa |
| `docs/DECISIONS.md` | Keputusan arsitektur + alasannya |
| `docs/LOCAL-TESTING.md` | Cara menjalankan app lokal dengan data uji |

**Kalau Anda (pemilik sistem) mau tahu kondisi terbaru tanpa membaca
kode: baca `docs/DEPLOY.md` bagian 3 dan 4.**

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

#### Guard anchor saja TIDAK cukup — cek hasilnya juga

Pengalaman kedua: `scripts/verify-docs.mjs` (file nyantis, sudah
di-commit, 204 baris) berakhir **0 byte**. Penyebabnya skrip Node yang
menulis ulang file itu sendiri. Anchor-nya cocok, semua guard lulus,
skrip mencetak "berhasil" — lalu filenya kosong.

Jadi dua hal tambahan untuk setiap skrip yang menulis file:

```js
// 1. Sebelum tulis: pastikan isi baru tidak kosong dan masuk akal
if (!out || out.length < isiAsli.length * 0.5) {
  console.error("ABORT: hasil terlalu pendek -- tidak menulis");
  process.exit(1);
}

// 2. Setelah tulis: verifikasi ukuran di disk, bukan cuma di memori
writeFileSync(p, out, "utf8");
const diDisk = readFileSync(p, "utf8");
if (diDisk.length !== out.length) {
  console.error("GAGAL: yang tersimpan tidak sama dengan yang ditulis");
  process.exit(1);
}
```

Dan paling penting: **`git status` + `git diff --stat` setelah menulis
file**. File yang berubah 0 byte atau menyusut drastis langsung terlihat
di sana — dan itu satu-satunya tempat yang tidak bisa dilewati oleh bug
di skrip-nya sendiri.

Kalau sudah terlanjur rusak dan file-nya ter-commit, pulihkan dengan
`git checkout HEAD -- <path>`, lalu terapkan ulang perubahannya dengan
tool `edit` (yang menampilkan diff) — bukan dengan skrip rewrite lagi.

### 2.4 Jangan menebak
Kalau tidak yakin sebuah kolom/tabel benar-benar ada, cek dulu:

```powershell
Select-String -Path src\db\schema.ts -Pattern 'pgTable\("'
```

Kolom yang dipakai halaman tapi tidak ada di schema = bug senyap yang
nilai 0-nya selalu fallback diam-diam. Sudah ditemukan berkali-kali:
`ttl`, `address_ktp`, `phone_wa`, `emergency_contact`, `join_date`,
`employment_status`, `contract_end_date`, `weight`, `religion`.

### 2.5 Dokumentasi di-UPDATE, bukan DIGANTI

`docs/STATUS.md` menyimpan katalog bug — itu hasil kerja terpenting, bukan
daftar fitur. Setiap batch tambah bagiannya; jangan menimpa bagian lain
sekalian.

Yang sudah terjadi sekali: saat menulis bagian baru, sebuah `edit`
menimpa **judul** bagian di bawahnya. Isi 6 bug-nya utuh, judulnya hilang,
dan pembaca berikutnya mengira itu bagian yang salah. Tidak ada
kompiler yang menangkapnya.

Tiga aturan:

1. **Baca target sebelum mengedit.** Kalau `oldString` tidak cocok, jangan
   dipaksa — cari tahu dulu bentuk sebenarnya.
2. **Sisakan penanda kalau isinya sengaja diganti.** Kalau sebuah daftar
   tidak boleh ada lagi, tulis kenapa di tempatnya. "Dihapus karena sudah
   tidak benar" jauh lebih berguna daripada keheningan.
3. **Dokumentasi perlu guard-nya sendiri**, sama seperti kodenya.
   `npm run verify:docs` memeriksa: klaim basi, jumlah assert yang
   ditulis vs yang dijalankan, judul duplikat, rujukan path, dan
   karakter non-Latin. Jalankan setiap selesai mengubah dokumentasi.

Isi dokumentasi juga bisa merusak dirinya sendiri tanpa disadari — file
markdown tidak pernah diuji, dan tidak ada `tsc` yang melihatnya.

### 2.6 Skema Drizzle dan SQL migrasi WAJIB dicek silang

Skema (`src/db/schema.ts`) dan file migrasi (`drizzle/*.sql`) adalah dua
tulisannya struktur database yang sama. Kalau hanya satu yang berubah,
selisihnya muncul sebagai error yang jauh dari penyebabnya.

Empat selisih yang sudah terjadi, semuanya di migrasi 0014:

| Selisih | Gejala |
|---|---|
| Kolom di SQL tanpa `DEFAULT`, tapi skema bilang `.defaultRandom()` | 500 "null value in column id" |
| Kolom `uuid` di SQL, tapi `users.id` bertipe `text` | FK ditolak "incompatible types" |
| Kolom ada di skema, tapi tidak ikut diselect di DAL | typecheck "missing N properties" |
| Tipe kolom beda antara skema dan tabel | nilai terbaca salah diam-diam |

Baris ketiga paling mengelirukan: `Row` di DAL diturunkan dari
`$inferSelect`, jadi **satu kolom yang tidak diambil** membuat setiap
`rows.map(toKpi)` gagal, dan pesannya tidak menyebut kolom mana.

Aturan: setiap kali menambah kolom, cek keempatnya di tempat yang
sama. Jangan menambah kolom di skema tanpa menambahkannya ke select
DAL kalau tabel itu punya select eksplisit.

### 2.7 `ADD COLUMN IF NOT EXISTS` tidak memperbaiki kolom yang salah tipe

Penting untuk migrasi yang dijalankan manual.

Kalau run pertama membuat kolom dengan tipe A lalu file diperbaiki
menjadi tipe B, run kedua membaca "sudah ada, skipping", dan tipe A
tetap di sana. FK atau constraint yang bergantung padanya akan gagal
**selamanya**, dan pesan errornya tidak pernah menyuruh memperbaiki
tipenya.

Solusi: tambahkan langkah normalisasi eksplisit yang aman di kedua
keadaan. Lihat LANGKAH 4 di `drizzle/0014_supabase_parity.sql`.

### 2.8 Ganti teks dengan skrip: kunci harus non-overlapping

Pengalaman yang merusak `src/db/schema.ts`, dipulihkan dengan
`git checkout`.

Skrip saya memakai daftar pasangan penggantian. Dua kunci tumpang
tindih: kunci pendek sudah menjadi bagian dari hasil penggantian
kunci panjang, lalu diterapkan lagi ke baris yang sama. Akibatnya
`defaultNow` menjadi `defkultNow`, `departments` menjadi
`depkrtments`, dan ratusan baris lain rusak dalam satu kali jalan.

Tiga aturan:

1. **Satu baris hanya boleh experiencing satu penggantian per item
   daftar.** Terapkan penggantian satu kali per pasangan, jangan
   dalam loop tanpa batas.
2. **Kunci harus sepanjang mungkin.** Kalau dua kunci bisa cocok pada
   teks yang sama, itu bug yang belum terjadi.
3. **Setelah menulis file, jalankan `npx tsc --noEmit`.** Typecheck
   adalah satu-satunya tempat yang langsung memberi tahu kalau file
   rusak, bukan review mata.

Perubahan yang perlu ditulis ulang dalam jumlah besar sebaiknya
memakai tool `edit`, yang menampilkan diff.

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

#### Scoping otorisasi harus dari SERVER, bukan dari `AuthContext`

Filter "user bisa melihat siapa" selalu dibaca dari database, tidak pernah
dari `AuthContext`. Contoh yang sudah kerjakan: `managedDepartments` untuk
Head (halaman kualitas & penugasan), `department` untuk reported.

Dua jebakan yang sudah muncul:

1. Halaman `head/quality`, `head/penugasan`, `head/penugasan/new`, dan
   `hr/assignments/new` semuanya mengambil `managedDepartments` dari
   `AuthContext`. Semuanya bocor — Head tinggal mengubah nilainya.
   Sekarang lewat `scope=managed`.
2. Assignment milik Head sendiri sering **tidak punya** `department_id`
   (dia undivided). Filter `IN (divisi)` menyembunyikan KPI-nya sendiri,
   jadi perlu `OR user_id = aktornya`.

Rincian tiap halaman ada di `docs/STATUS.md`.

### 3.5 `withAuth` dulu menelan semua penolakan

Ini yang paling berbahaya dan sudah diterapkan ke seluruh Route Handler.

`withAuth` selalu membungkus hasil handler:

```ts
return Response.json({ ok: true, data });
```

Kalau handler mengembalikan `Response` sendiri — yang dilakukan hampir
semua Route Handler untuk validasi — `Response` itu **tidak bisa
di-serialize**. Hasilnya `{ ok: true, data: {} }` dengan status **200**.

Artinya "Nilai harus angka", "Bulan harus 1-12", "Divisi itu bukan milik
Anda" — semua sampai ke browser sebagai **sukses dengan data kosong**.
Tidak ada error, tidak ada crash, `tsc` bersih, log bersih. Klien malah
melempar error karena bentuk datanya tidak sesuai.

Perbaikan: `withAuth` sekarang mengembalikan `Response` apa adanya kalau
handler memang mengembalikan `Response`.

Pelajaran generalize: **kalau sebuah pembungkus transforming mashed up
nilai, cek dulu bentuk yang sebenarnya keluar** — jangan hanya cek status
code.

### 3.6 Kolom yang tidak pernah diisi — hasil akhirnya selalu 0

`kpi_assignments.working_days_elapsed` **tidak pernah ditulis di mana
pun**: tidak ada trigger, tidak ada kode. Default 0.

Rantai akibatnya: `expectedTotal` selalu 0 → `pacePct` selalu 0 →
`achievementPercentage` untuk KPI `result` dan `activity` **selalu 0**,
berapa pun laporan yang sudah diisi. Tampilannya rapih, angkanya nol.

Cek ini sebelum migrasi berikutnya: cari setiap kolom numerik di schema,
lalu cari apakah ada yang menulisnya. Kalau tidak ada satu pun tempat,
nilainya pasti 0 dan setiap perhitungan yang memakainya menghasilkan
nol — diam-diam.

### 3.7 Filter yang benar-benar tidak menyaring apa pun

Kasus pola nyata: halaman Head menghitung skor KPI tim dengan
`getWeights(userId)`. Hook itu memanggil `/api/kpi-settings?scope=all`,
yang butuh role hr/executive — jadi Head selalu dapat **403**.

Karena `getWeights()` kalau gagal mengembalikan `DEFAULT_WEIGHTS`, halaman
tetap tampil dengan angka — **50/30/20**, bukan bobot yang HR setel.
Tidak ada error, tidak ada crash, tidak ada 403 yang kelihatan (fetch
diam-diam, tanpa toast).

Rule: kalau sebuah nilai yang seharusnya spesifik punya fallback default,
fallback itu menutupi kegagalan tanpa jejak. Saat pakai `useApiQuery`,
periksa juga `error`-nya; jangan hanya mengandalkan nilai yang tampil.

Pola sama: `departmentIds: []` pada filter `IN (...)` berarti **tidak ada
hasil**, bukan "semua". Kalau Head tidak punya divisi yang dikelola,
hasilnya kosong — itu benar, dan harus berbeda dari `null` (semua).

### 3.8 `ON CONFLICT DO NOTHING` tanpa target tidak mencegah apa pun

Kalau tidak ada constraint yang cocok, tiap insert berhasil. Seed saya
jalankan 7× karena error → 15 baris `departments` dari 5 yang
seharusnya.

Schema yang **tidak punya UNIQUE padahal seharusnya**: `departments.name`,
`office_locations.name`, `kpis.title`, `letter_types.code`.
Lihat `docs/STATUS.md` → migrasi 0010.

### 3.9 Tidak semua kolom id bertipe UUID

Hanya `users.id` yang bertipe **text**. Semua tabel lain pakai
`uuid("id").defaultRandom()`. akibatnya `isUuid()` yang sama tidak bisa
dipakai di mana saja.

Dua arah kesalahan, keduanya sudah terjadi:

- **Terlalu longsar.** `GET /api/users?id=bukan-uuid` → `200 {user: null}`.
  Tidak ada error; klien yang tidak memeriksa isi menganggapnya berhasil.
  Sekarang 404.
- **Terlalu ketat.** `isUuid(userId)` di `GET /api/kpi-settings` menolak
  semua user uji lokal (`u-hr-001`), karena id-nya bukan UUID.
  `verify:assignments` langsung menangkapnya — 2 assert gagal.

Aturan: cek dulu ke `src/db/schema.ts` apakah kolomnya `uuid` atau
`text` sebelum menambahkan validasi format. Kolom uuid perlu dicek
(format salah → `invalid input syntax for type uuid` → 500). Kolom text
tidak perlu dicek format, tapi **harus dicek keberadaannya** — kalau
tidak, `getUserWeights()` mengembalikan default untuk user yang tidak
ada dan terlihat seperti jawaban yang benar.

### 3.10 Validasi "total harus 100" saja tidak cukup

`PUT /api/kpi-settings` dulu hanya memeriksa `result + activity + quality
=== 100`. Itu loloskan `-10 + 60 + 50 = 100`.

Bobot negatif membuat skor KPI orang itu tidak bermakna, dan tidak ada
yang melihat kesalahannya karena totalnya memang 100. Sekarang lima
field wajib ada, bulat, dan 0-100.

Pelajaran generalize: **cek rentang dan bentuk, bukan cuma invariant
yang kebetulan sudah ada.** Kalau sebuah angka harus berada dalam batas
tertentu, itu batasnya adalah validasinya — bukan turunannya.

### 3.11 Angka yang dilaporkan harus berasal dari perubahan nyata

`softDeleteKpis` membatalkan penugasannya dulu, baru menandai
`deleted_at`, lalu menghitung "berapa KPI terpengaruh" dengan filter
`deleted_at IS NULL`. Karena penandaan sudah terjadi di langkah
pertama, hasilnya **selalu 0**.

UI menampilkan "0 dari 1 KPI dipindahkan. Sisanya tidak berubah" —
untuk aksi yang **berhasil**. Caller memakai `res.data?.kpis ?? 0`, jadi
nilai yang hilang pun tidak kelihatan.

Yang membuatnya lolos 79 assert: semua assert memeriksa **efeknya**
(`deleted_at` terisi, penugasan jadi `cancelled`) — bukan **laporannya**.
Keduanya benar, dan efeknya benar. Yang salah justru laporannya.

Aturan:

- Kalau UI menampilkan jumlah, hitung dari `returning()` atau `affectedRows`.
  Jangan dari `?? 0`.
- Kalau sebuah nilai bisa `undefined` di tengah jalur, ada bug di jalur
  itu — bukan di tampilan.
- Uji **jalur berbeda** secara terpisah. Bug ini hanya ada di jalur
  satu-id; jalur massal sudah benar. Satu test untuk keduanya menutup
  keduanya.

### 3.12 `next build` dan `next dev` tidak boleh berbagi folder output

Keduanya menulis ke `.next`. Kalau `verify:build` dijalankan saat dev
server hidup, build menimpa chunk yang sedang dipakai. Gejalanya jauh
dari build: `/_next/static/css/*.css` dilayani sebagai `text/plain`,
Route Handler membalas 500 (`Cannot find module './1331.js'`), overlay
Next.js menampilkan `Runtime Error [object Event]`.

Tidak ada satu pun jejak bahwa ini soal build — `tsc` bersih, log
terlihat normal. Terlihat seperti bug aplikasi yang serius.

`next.config.ts` membaca `NEXT_DIST_DIR`; `scripts/build-verify.mjs`
menyetelnya ke `.next-verify`. Kalau salah satu gagal diam-diam, ganti
folder di **kedua** file itu.

Bentuk gejalanya yang baru terlihat setelah `verify:docs` dibuat:
`.next` tercemar membuat **sembilan suite perilaku sekaligus** membalas
0 assert. Semuanya satu penyebab, tapi tampilannya seperti sembilan bug
yang tidak berhubungan. Dan `verify:docs` yang dipakai untuk mencari
penyebabnya ikut ikut salah — dia melaporkan "dokumen bilang 24, dapat
0", yang mengarah ke dokumen.

Jadi `verify:docs` sekarang membedakan dua hal yang tadinya tertukar:

- skrip **tidak menghasilkan assert sama sekali** → dev server mati
- skrip jalan tapi angkanya **berbeda** → dokumen yang salah

Kalau yang pertama, dia mencetak perintah perbaikannya dan sengaja
tidak menyalahkan dokumen. Guard yang salah diagnosis lebih berbahaya
daripada tidak ada guard.

### 3.13 Kolom yang nilainya DITURUNKAN tidak boleh diedit dari form yang sama

`kpis.monthlyTarget` = `SUM(kpi_assignments.monthlyTarget)`. Jadi kalau
sudah ada penugasan, angka itu adalah jumlah target per orang — bukan
nilai yang dimiliki form KPI.

Yang pernah terjadi: form edit menulis angka itu ke KPI **dan** menimpanya
ke setiap penugasan (supaya terlihat "menyinkronkan"). Akibatnya target
per orang hilang dan total KPI jadi n kali terlalu besar.

Kalau calannya diturunkan dari tabel lain, form yang owning kolom itu
**menolak** perubahan dan mengarahkan ke halaman yang manage tabel
anaknya. Jangan menerima lalu diam-diam menimpa.

Dan jangan memanggil `recalc` tepat setelah menyimpan nilai dari form —
recalc akan menimpa angka yang baru saja diketik user. `recalc` hanya
boleh jalan setelah perubahan pada tabel anak.

### 3.14 Amount yang dikirim dari browser tidak pernah dihitung ulang

Pola yang sama seperti §3.13, tapi soal uang:

`payroll_staff_settings.upsert(...)` ditulis dari browser **tanpa cek
role sama sekali**. Siapa pun yang punya sesi — termasuk staf biasa —
cukup membuka `/absensi/admin/payroll/settings` lalu mengubah gaji
dasar siapa pun. Angka negatif juga diterima.

Hal yang sama terjadi pada gaji lembur: `total_overtime_pay` dikirim
dari klien apa adanya, dan langsung dipakai untuk menghitung slip gaji.

Rule: **nilai yang memengaruhi uang orang lain harus dihitung server.**
Kirim parameter (tarif, plafon, durasi), bukan hasilnya. Kalau ada
override manual, wajib disertai alasan dan tercatat di audit trail —
tanpa itu, perhitungannya pindah ke server tapi angkanya masih bisa
dipalsukan.

Variasinya: **data yang sudah dilihat orang lain tidak boleh berubah
diam-diam.** Slip gaji yang sudah `published` sudah dibaca staf — jadi
`update` dan `delete` harus ditolak. Perubahan hanya boleh lewat
publish ulang, supaya ada jejaknya.

### 3.15 Guard yang tidak pernah gagal sama dengan tidak ada guard

`scripts/verify-no-stub.ts`. Allowlistnya sudah kosong (migrasi selesai).
Kalau allowlist itu boleh diisi lagi tanpa dicek, dia akan diisi lagi —
dan diam-diam. Jadi sekarang:

- Allowlist tidak kosong → **gagal**, walau file yang terdaftar sudah
  tidak memakai stub.
- Pesannya: "allowlist harus menyusut, tidak pernah tumbuh".

Dan guard itu sendiri punya test (`scripts/verify-stub-guard.mjs`) yang
sengaja memanipulasinya: mengisi allowlist → harus gagal; membuat file
berisi import stub → harus gagal; membersihkan lagi → harus lulus.

Guard yang belum pernah diuji hanya guard yang belum bekerja.

### 3.16 `spawnSync` tanpa `shell: true` gagal diam-diam di Windows

Menjalankan `npx`/`tsx` dari `spawnSync` menghasilkan **kode 1 tanpa
output sama sekali**. Terlihat seperti program-nya yang gagal, bukan
seperti pemanggilannya yang salah — dan kalau yang dipanggil adalah
guard, artinya guard-nya terlihat "rusak" padahal tidak.

Pakai `spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", ...])`
untuk menjalankan hal lokal. Kalau memang harus `shell: true`, sadari
sekali bahwa argumennya akan melewati parser cmd.exe.

### 3.17 Guard yang memanggil dirinya sendiri

`verify:docs` memanggil semua skrip `verify:*` untuk membandingkan jumlah
assert yang tertulis di dokumentasi dengan yang benar-benar jalan.
Jadi skrip itu sendiri ikut terpanggil — dan memanggil blok pemeriksa
dokumentasinya lagi, tanpa henti. Sampai 8 proses node, harus dihentikan
manual.

Rule: **guard yang memanggil skrip lain dari daftar yang dia sendiri
sebut harus mengecualikan dirinya.** Satu baris, tapi tidak ada yang
menulisnya karena kelihatan benar saat diketik.

### 3.18 `Select-String` dengan `\uXXXX` di PowerShell tidak meng-escape

`Select-String -Pattern '[\u4e00-\u9fff]'` **mencocokkan hampir semua
baris**, karena `\u` di dalam kurung siku bukan escape — PowerShell
mengliteralkan seluruh karakternya. Hasilnya kelihatan seperti "puluhan
baris rusak" padahal file-nya bersih.

Untuk cek karakter non-Latin, pakai Node dengan regex JS
(`/[\u4e00-\u9fff]/u`), yang memang punya escape itu. Sama untuk regex
kompleks lain: jangan mengandalkan `Select-String` untuknya.

Dua alatnya sudah tersedia:

```powershell
node scripts\show-cjk.mjs AGENTS.md     # laporkan + tampilkan escaped codepoint
npm run verify:docs                     # gagal kalau ada, di semua dokumen
```

`show-cjk.mjs` penting karena **PowerShell merender karakter CJK
sebagai `?`** — jadi kalau karakter asing sudah masuk, `read` dan
`grep` tidak bisa menunjukkannya, dan teks yang rusak terlihat benar.
Skrip itu mencetak posisinya sebagai `U+4E00` sehingga kelihatan.
Catatan: `verify:docs` hanya bilang ada/tidak -- tidak bisa menunjuk
baris yang mana. Karena itu perbaiki per nomor baris, bukan dengan regex
pencocok yang mengandungi karakter aslinya.

### 3.19 Error SSH yang sama sekali tidak ada hubungannya dengan SSH

Perintah yang mengandung `bash`, atau yang menjalankan sebuah file
sebagai perintah remote, gagal dengan:

```
Warning: Identity file /root/.ssh/id_vps not accessible: No such file or directory.
root@168.231.118.146: Permission denied (publickey).
```

Ini **bukan** masalah kunci. Kuncinya tidak pernah dibaca. Harness shell
lokal mengenali pola `bash <file>` dan ikut memprosesnya secara lokal —
di mesin ini `bash` = WSL, dan WSL tidak punya distro terpasang. Setelah
itu pemanggilan ssh dijalankan dengan argumen yang sudah kacau.

Dua jam terbuang karena errornya terlihat sangat meyakinkan: "publickey
ditolak" selalu membuat orang mengira kuncinya salah.

| Bentuk | Hasil |
|---|---|
| `ssh vps hostname` | OK |
| `ssh vps "cat X \| sh"` | OK |
| `ssh vps "cat X \| bash"` | GAGAL |
| `ssh vps bash /path/x.sh` | GAGAL |
| `ssh vps /path/x` | GAGAL |
| `ssh vps "cat X \| sh -s"` | OK |

Aturan: **`cat file | sh`, dan `sh` saja.** Skrip yang dikirim ke VPS
harus POSIX `sh`: tanpa `set -o pipefail`, tanpa `<<<`, tanpa array.

Dua konsekuensi lanjutan:

1. **Skrip deploy harus POSIX, bukan bash** -- bukan karena bash lebih
   jelek, tapi karena tidak ada cara lain memanggilnya.
2. **Kutip PowerShell → bash → ssh tiga lapis hampir selalu rusak.**
   Jangan menulis `psql -c "SELECT 'x'"` langsung di baris perintah.
   Tulis skrip `.sql`/`.sh` di file, kirim pakai `scp`, jalankan di VPS.

Tersedia di VPS untuk baca data (aman, read-only):

```powershell
ssh vps "cat /usr/local/bin/novacore-inspect | sh"   # kondisi DB
ssh vps "cat /usr/local/bin/novacore-verify | sh"    # verifikasi pasca-migrasi
ssh vps "cat /usr/local/bin/novacore-apply-migrations | sh"  # migrasi
```

Host `vps` sudah terdaftar di `~/.ssh/config` dengan path **absolut**
(`C:/Users/Banzilla/.ssh/id_vps`), bukan `~/` — karena `HOME` kosong di
mesin ini dan Windows OpenSSH jatuh ke `/root/.ssh/`. Gejalanya sama persis
dengan di atas: "Permission denied (publickey)" padahal config-nya benar.
`ssh -G vps` selalu menampilkan path yang benar walau koneksi gagal --
jadi jangan percaya `-G` sebagai bukti koneksi berhasil.

Bonus dari migrate: nama constraint KPI di `0010` adalah
`kpis_title_period_unique`, bukan `kpis_title_year_month_unique` seperti
yang tertulis di catatan lama. Verifikasi yang mencari nama salah akan
melaporkan constraint hilang padahal ada.

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

Dengan dev server jalan, dua pemeriksa tambahan — keduanya membaca
**isi** respons dan **isi** database, bukan cuma status code:

```powershell
npm run verify:endpoints    # 24 endpoint: amplop, status, isi data
npm run verify:quality      # 32 assert: scoping, penolakan, nilai tersimpan
npm run verify:assignments  # 70 assert: scoping, validasi, audit trail
npm run verify:feedbacks    # 39 assert: laporan benar-benar tersimpan
npm run verify:reports      # 65 assert: koreksi, kepemilikan, tanggal
npm run verify:adminkpi     # 64 assert: role, divisi, bobot, hapus KPI
npm run verify:hrkpi        # 123 assert: sampah, restore, cascade, bulk, copy, form
npm run verify:overtime     # 76 assert: tahap lembur, transisi, gaji di server
npm run verify:payroll      # 84 assert: otorisasi gaji, angka negatif, slip terkunci
npm run verify:stubguard    # 10 assert: guard stub benar-benar gagal
npm run verify:docs        # 32 assert: dokumentasi + skrip vps tidak berbohong
```

Semuanya membersihkan data ujinya sendiri, jadi bisa dijalankan berulang
kali. Kalau salah satu gagal, itu bug yang tidak akan terlihat dari `tsc`
maupun `next build`.

Satu skrip saja belum cukup: masing-masing hanya menguji endpoint-nya.
`verify:endpoints` tetap wajib jalan setelah perubahan apa pun di
`withAuth`, karena satu wrapper yang salaheken beberapa halaman sekaligus.

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
`0008_letter_numbering`, `0009_users_employment`,
`0010_unique_constraints`, `0011_kpis_brand`, `0012_feedbacks`,
`0013_payroll_columns`, `0014_supabase_parity`,
`0015_data_migration`, `0016_widen_achievement_percentage`.

**Semua sudah terpasang di VPS per 2026-10-03 dan diverifikasi.** Daftar
lengkap + cara menjalankan ada di `docs/DEPLOY.md` §4.

### 5.1 `0015` DIJALANKAN SEKALI, dan itu bukan idempotent

`0015_data_migration.sql` memindahkan data Supabase ke tabel aplikasi.
Ia **TRUNCATE lalu INSERT**, jadi tidak bisa dijalankan dua kali tanpa
memotong data yang sudah ada. Berbeda dengan semua migrasi lain di
folder ini yang idempotent.

Kalau perlu menjalankan ulang, kembalikan dulu dari backup:

```
/root/backups/before-data-migration-<timestamp>.sql.gz
```

Yang perlu dijaga di migrasi ini:

- Sumbernya schema `_staging`, bukan Supabase langsung. `_staging`
  sudah dibuktikan identik dengan Supabase (23 dari 23 tabel, 14854
  baris, dibandingkan dengan md5 dari seluruh baris yang sudah
  diurutkan) sebelum 0015 dijalankan.
- SQL-nya **dihasilkan** oleh `novacore-gen-migration` dari katalog
  PostgreSQL, bukan ditulis tangan. Jangan diedit manual: daftar kolom
  dan daftar nilai dibuat dari satu query, jadi tidak mungkin beda
  panjang. Setelah mengubah skema, generate ulang.
- Dua kolom dihitung, bukan disalin: `users.managed_departments`
  (nama divisi -> UUID) dan `kpi_assignments.kpi_type` (dari
  `kpis.type`). Keduanya punya penjelasan di kepala berkas.
- 32 kolom dibungkus `COALESCE` dengan default milik aplikasi,
  karena nullable di Supabase tapi `NOT NULL` di aplikasi. Hanya satu
  yang benar-benar punya baris NULL: `payrolls.payroll_overtime_minutes`,
  36 dari 71 baris.
- **Jalankan dry run lebih dulu.** `novacore-dryrun` menjalankan 0015
  lalu `ROLLBACK`, sambil membandingkan jumlah baris di dalam transaksi
  yang sama. Dua bug nyata tertangkap begitu:
  `kpi_assignments.achievement_percentage` meluap `numeric(7,2)`, dan
  `payrolls.payroll_overtime_minutes` NULL melanggar `NOT NULL`.
  Keduanya akan lolos dari pemeriksaan manual dan memotong data.

### 5.2 `0016` harus dijalankan SEBELUM `0015`

`0016` memperlebar `kpi_assignments.achievement_percentage` ke
`numeric(15,2)`. Kalau `0015` jalan lebih dulu, INSERT gagal dengan
"numeric field overflow" — bukan karena datanya salah, tapi karena
kolomnya lebih sempit dari data.

Data itu nyata: 3 dari 2707 assignment punya `expected_total = 0`,
jadi pace rate meledak sampai 891707.64%. Akar masalahnya
`working_days_elapsed` tidak pernah diisi (§3.6), dan itu **tidak**
diperbaiki oleh 0016 — angka besarnya tetap sampai bug itu diperbaiki.

⚠️ Daftar ini **manual**, dan `0009` pernah terlewat karena tidak masuk
sini — gejalanya "kolom itu seharusnya ada tapi tidak ada". Kalau menambah
migrasi baru, perbarui tiga tempat sekaligus: daftar di sini, tabel status
di `docs/DEPLOY.md` §4, dan bagian referensinya di `verify:docs` -- supaya
referensi supaya tidak ada rujukan ke file yang tidak ada).

`0010` punya dua bagian: bagian 1 hanya melaporkan duplikat, bagian 2
membatalkan diri sendiri kalau duplikatnya ada. **Jalankan bagian 1
terlebih dahulu dan periksa hasilnya** sebelum lanjut — jangan Andalkan
`RAISE EXCEPTION` sebagai satu-satunya penjaga, karena di produksi itu
berarti constraint tidak terpasang sama sekali.

Hasil di produksi: **0 duplikat**, keempat constraint terpasang.

Nama constraint KPI di `0010` adalah `kpis_title_period_unique` — bukan
`kpis_title_year_month_unique` seperti yang pernah tertulis di catatan.
Query verifikasi yang mencari nama salah melaporkan "constraint hilang"
padahal ada.

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
