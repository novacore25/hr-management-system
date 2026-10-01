-- Data ketenagakerjaan untuk halaman /absensi/admin/staff.
--
-- Ketiganya dipakai form edit staf (tanggal masuk, status kepegawaian,
-- tanggal berakhir kontrak) dan dibutuhkan payroll untuk prorata.
-- Ketiganya nullable supaya user yang sudah ada tidak perlu diisi dulu.
--
-- Idempotent: aman dijalankan berulang kali.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS join_date          date,
  ADD COLUMN IF NOT EXISTS employment_status  varchar(32),
  ADD COLUMN IF NOT EXISTS contract_end_date  date;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'users'
  AND column_name IN ('join_date', 'employment_status', 'contract_end_date')
ORDER BY column_name;