-- Perbaikan tabel `feedbacks` supaya cocok dengan cara aplikasi memakainya.
--
-- Idempotent: aman dijalankan berulang kali.
--
-- MASALAH YANG DIPERBAIKI
-- -----------------------
-- Schema Drizzle memodelkan `feedbacks` sebagai "catatan untuk satu
-- assignment KPI": ada `assignment_id` NOT NULL yang mereferensikan
-- kpi_assignments.
--
-- Tapi tidak ada satu pun kode yang memakai itu. Dua pemanggil sebenarnya:
--
--   src/components/FeedbackModal.tsx (INSERT)
--     user_id, user_name, department, role, type, message, status
--
--   src/app/dashboard/developer/feedbacks/page.tsx (SELECT + UPDATE)
--     id, user_id, user_name, department, role, type, message, status,
--     created_at, updated_at
--
-- `user_name`, `department`, `role`, dan `type` tidak pernah ada di tabel,
-- dan `assignment_id` NOT NULL tidak pernah diisi. Jadi setiap laporan bug
-- dari modal akan GAGAL — bukan karena bug yang dilaporkan, tapi karena kolom
-- tidak ada dan assignment_id kosong. Tidak ada error yang sampai ke user:
-- stub `createClient()` membalas `error: null`.
--
-- Artinya fitur "Lapor Bug / Fitur" tidak pernah benar-benar menyimpan
-- satu laporan pun sejak migrasi.
--
-- Yang dilakukan
-- ---------------
-- Menambah kolom yang memang dibutuhkan. `assignment_id` dibuat nullable
-- (tidak dihapus) supaya tidak ada data yang hilang kalau ternyata ada
-- baris lama yang memakainya.

\echo ''
\echo '=== 1. Laporan dulu: apakah ada baris yang memanfaatkan assignment_id? ==='

SELECT count(*) AS total,
       count(*) FILTER (WHERE assignment_id IS NOT NULL) AS pakai_assignment_id
FROM feedbacks;

\echo ''
\echo '=== 2. Tambah kolom yang dibutuhkan aplikasi ==='

ALTER TABLE feedbacks ADD COLUMN IF NOT EXISTS user_name text;
ALTER TABLE feedbacks ADD COLUMN IF NOT EXISTS department text;
ALTER TABLE feedbacks ADD COLUMN IF NOT EXISTS role varchar(32);
ALTER TABLE feedbacks ADD COLUMN IF NOT EXISTS type varchar(16);

-- Nullable supaya insert dari FeedbackModal (yang tidak punya assignment)
-- tidak ditolak FK/NOT NULL.
ALTER TABLE feedbacks ALTER COLUMN assignment_id DROP NOT NULL;

\echo ''
\echo '=== 3. Isi ulang baris lama yang kolom barunya kosong ==='
-- Baris yang sudah ada (bila ada) tidak punya user_name/department/role/type.
-- Diisi dari tabel users supaya halaman developer tidak menampilkan
-- "undefined" dan filter tipe tidak Pale. user_name & department diisi dari
-- join; type diberi default 'other' karena tidak bisa ditebak.

UPDATE feedbacks f
SET user_name = COALESCE(NULLIF(f.user_name, ''), u.name),
    department = COALESCE(NULLIF(f.department, ''), d.name, ''),
    role = COALESCE(NULLIF(f.role, ''), u.kpi_role::text),
    type = COALESCE(NULLIF(f.type, ''), 'other')
FROM users u
LEFT JOIN departments d ON d.id = u.department_id
WHERE f.user_id = u.id;

-- Baris tanpa user yang cocok (user sudah dihapus) — FK cascade seharusnya
-- sudah membersihkannya, tapi jangan biarkan NULL_NOT_NULL karena NOT NULL
-- belum kita pasang.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM feedbacks WHERE message IS NULL OR btrim(message) = '') THEN
    RAISE EXCEPTION
      'Ada baris feedbacks dengan message kosong. Bersihkan dulu sebelum menambah NOT NULL.';
  END IF;
END $$;

-- user_name jadi NOT NULL setelah data lama diperbaiki: DAL selalu mengisinya
-- dari session, jadi tidak ada cara insert tanpa itu dari aplikasi.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'feedbacks_user_name_nn'
  ) THEN
    ALTER TABLE feedbacks
      ALTER COLUMN user_name SET DEFAULT '',
      ALTER COLUMN user_name SET NOT NULL;
    RAISE NOTICE 'feedbacks.user_name -> NOT NULL';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'feedbacks_type_nn'
  ) THEN
    ALTER TABLE feedbacks
      ALTER COLUMN type SET DEFAULT 'other',
      ALTER COLUMN type SET NOT NULL;
    RAISE NOTICE 'feedbacks.type -> NOT NULL';
  END IF;
END $$;

-- type hanya boleh bug / feature / other. Dicek di DAL juga, tapi CHECK
-- menutup jalur lain (psql manual, impor).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'feedbacks_type_check'
  ) THEN
    ALTER TABLE feedbacks
      ADD CONSTRAINT feedbacks_type_check
      CHECK (type IN ('bug', 'feature', 'other'));
    RAISE NOTICE 'feedbacks.type -> CHECK (bug|feature|other)';
  END IF;
END $$;

-- Status juga dipakai sebagai enum di UI.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'feedbacks_status_check'
  ) THEN
    ALTER TABLE feedbacks
      ADD CONSTRAINT feedbacks_status_check
      CHECK (status IN ('open', 'in_progress', 'resolved', 'rejected'));
    RAISE NOTICE 'feedbacks.status -> CHECK';
  END IF;
END $$;

\echo ''
\echo '=== 4. Index untuk urutan halaman developer ==='
-- Halaman selalu `ORDER BY created_at DESC` tanpa filter status.
CREATE INDEX IF NOT EXISTS feedbacks_created_at_idx
  ON feedbacks (created_at DESC);

\echo ''
\echo '=== hasil ==='
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'feedbacks'
ORDER BY ordinal_position;
