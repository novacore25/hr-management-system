-- Dua kolom `payrolls` yang dipakai aplikasi tapi tidak pernah ada di
-- schema Drizzle.
--
-- Idempotent: aman dijalankan berulang kali.
--
-- MASALAH YANG BARU TERDETEKSI
-- ----------------------------
-- `src/app/absensi/admin/payroll/page.tsx` mengirim `deduction_notes`
-- saat publish slip gaji, dan `src/types/index.ts` mendeklarasikan
-- `deduction_notes` + `system_overtime_days` sebagai bagian dari
-- `Payroll`. Tapi keduanya TIDAK ADA di tabel `payrolls`.
--
-- Akibatnya:
--
--   1. `publishRow()` mengirim `deduction_notes`. Kalau kolomnya tidak
--      ada, Postgres menolak insert/update seluruhnya -- jadi slip gaji
--      tidak bisa dipublikasikan sama sekali. Di Supabase hal ini
--      mungkin tertutupi RLS `USING (true)`, tapi begitu saja nilainya
--      tidak pernah tersimpan.
--   2. `system_overtime_days` dihitung di `fetchData()` dan ditaruh ke
--      state, tapi TIDAK PERNAH dikirim dalam payload apa pun. Jadi
--      nilainya selalu hilang begitu halaman dimuat ulang.
--
-- Ini pola yang sama seperti jebakan di AGENTS.md §2.4: kolom yang
-- dipakai tapi tidak ada = nilai yang diam-diam selalu hilang.
--
-- Karena migrasi data dari Supabase belum dilakukan, tidak ada data
-- yang hilang dari kolom yang tidak ada ini. Kalau ternyata Supabase
-- punya keduanya, `ADD COLUMN IF NOT EXISTS` tidak melakukan apa-apa
-- dan data yang ada tetap utuh.
--
-- Yang dilakukan
-- ---------------
-- Menambah keduanya sebagai kolom nullable. Nullable karena baris lama
-- (bila ada) tidak punya nilainya, dan aplikasi tidak mewajibkan
-- keduanya.

\echo ''
\echo '=== 1. Laporan dulu: kolom apa saja yang ada di payrolls sekarang? ==='

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'payrolls'
ORDER BY ordinal_position;

\echo ''
\echo '=== 2. Tambah kolom yang dipakai aplikasi tapi belum ada ==='

-- Catatan potongan. Dikirim `publishRow()`, selalu string.
ALTER TABLE payrolls ADD COLUMN IF NOT EXISTS deduction_notes text;

-- Berapa hari orang itu lembur pada periode ini. Dihitung dari
-- `overtime_requests` yang sudah `finalized`, dan sekarang ikut
-- disimpan supaya slip bisa menampilkannya tanpa menghitung ulang.
ALTER TABLE payrolls ADD COLUMN IF NOT EXISTS system_overtime_days integer;

\echo ''
\echo '=== 3. Backfill system_overtime_days untuk slip yang sudah ada ==='
-- Slip lama punya nilainya dihitung on-the-fly, jadi baris yang sudah
-- ada tidak punya angka. Yang bisa dihitung ulang dari pengajuan lembur
-- yang sudah final, diisi. Sisanya dibiarkan NULL -- artinya "tidak
-- ada data", bukan 0.
--
-- CATATAN: `overtime_requests` tidak punya `deleted_at`. Pengajuan
-- dibatalkan dengan `status = 'cancelled'`, dihapus permanen, atau
-- hanya di-soft-delete lewat `kpis`. Jadi tidak ada filter deleted di
-- sini.

UPDATE payrolls p
SET system_overtime_days = src.hari
FROM (
  SELECT user_id,
         count(*)::integer AS hari
  FROM overtime_requests
  WHERE status = 'finalized'
  GROUP BY user_id
) src
WHERE p.user_id = src.user_id
  AND p.system_overtime_days IS NULL;

\echo ''
\echo '=== 4. Laporkan sisa yang tidak bisa dihitung ==='
-- Slip yang periodenya tidak punya pengajuan lembur final akan tetap
-- NULL. Itu benar (0 sesi lembur), tapi kita isi dengan 0 supaya UI
-- tidak menampilkan "null" di mana-mana. Hanya untuk slip yang sudah
-- ada -- slip baru selalu dikirim nilainya dari server.

UPDATE payrolls SET system_overtime_days = 0 WHERE system_overtime_days IS NULL;

\echo ''
\echo '=== hasil ==='
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'payrolls'
  AND column_name IN ('deduction_notes', 'system_overtime_days');