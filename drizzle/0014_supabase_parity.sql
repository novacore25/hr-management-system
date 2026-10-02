-- Migrasi 0014: selaraskan skema dengan Supabase sebelum data dipindahkan.
--
-- Latar belakang (hasil audit 2026-10-02, read-only terhadap Supabase):
--   Supabase punya 297 kolom, kita cuma 260. Ada 37 kolom yang HANYA ada
--   di sana -- kalau dibiarkan, semuanya hilang diam-diam saat load.
--
-- Empat hal diperbaiki di sini:
--   1. 37 kolom + 2 foreign key yang hilang
--   2. Dua nilai enum yang tidak ada di kita (`leave_type.urgent` dan
--      `leave_status.approved_executive`) -- tanpa keduanya, satu baris
--      historis saja sudah membuat SELURUH load gagal
--   3. Constraint UNIQUE kpis yang salah, yang memblokir 962 baris
--   4. Kunci unik pada kpi_settings.id
--
-- ⚠️ SEMUA IDEMPOTENT. Dijalankan lewat `docker exec`, bukan migration
--    runner, jadi tidak ada yang mencatat sudah jalan atau belum.
--    Tiap langkah eksplisit memakai IF NOT EXISTS atau dicek dulu.

-- ═══════════════════════════════════════════════════════════════
-- LANGKAH 1 — Nilai enum
-- ═══════════════════════════════════════════════════════════════
--
-- Harus DI LUAR transaksi: PostgreSQL tidak mengizinkan nilai enum
-- baru dipakai di transaksi yang sama saat ditambahkan.
--
-- `leave_type.urgent`: fiturnya pernah ada lalu dihapus kebijakan HR.
--   Tetap ditambahkan supaya pengajuan historis yang memakainya bisa
--   dimuat. TIDAK akan ditawarkan di form.
--
-- `leave_status.approved_executive`: Tahap antara persetujuan 2 tahap
--   (Executive -> HR). Tanpa nilai ini, tahap 1 tidak punya tempat.

ALTER TYPE leave_type ADD VALUE IF NOT EXISTS 'urgent';
ALTER TYPE leave_status ADD VALUE IF NOT EXISTS 'approved_executive';

-- ═══════════════════════════════════════════════════════════════
-- LANGKAH 2 — Constraint UNIQUE kpis yang salah
-- ═══════════════════════════════════════════════════════════════
--
-- 0010 memasang UNIQUE (title, year, month). Data asliSupabase punya
-- 164 kelompok yang melanggar itu: 962 dari 2018 baris KPI.
--
-- INI BUKAN DATA DUPLIKAT. KPI yang tampak kembar itu berbeda
-- `brand` -- "VT Terupload" sekali untuk Glamritz, sekali untuk
-- DR.Belle, sekali untuk J.CHICKEN. Kuncinya lupa menyertakan
-- `brand`, kolom yang justru ditambahkan 0011.
--
-- Menambahkan UNIQUE dengan brand pun tidak berhasil: bahkan dengan
-- (title, year, month, brand, department_id) masih ada 3 kelompok
-- kembar -- "Absensi Karyawan" 2026-09, "Minimum GMV" 2026-10
-- brand Tianlala, "Creator Live" 2026-08 brand Qahira.
--
-- Jadi constraint-nya DILEPAS, bukan diperbaiki. Aplikasi lama
-- membiarkan kondisi ini terjadi, dan memasang constraint hanya demi
-- kerapian akan memaksa menghapus 962 baris -- yang melanggar syarat
-- "tidak ada data yang hilang".
--
-- Pencegahan duplikat tetap ada di level aplikasi:
-- `components/hr/KpiFormPage.tsx` menolak KPI dengan title+brand yang
-- sama di periode yang sama.
--
-- Yang ditambahkan hanya index NON-unique supaya pencarian cepat.

ALTER TABLE kpis DROP CONSTRAINT IF EXISTS kpis_title_period_unique;

DROP INDEX IF EXISTS kpis_title_period_lookup_idx;
CREATE INDEX IF NOT EXISTS kpis_title_period_lookup_idx
  ON kpis USING btree (title, year, month, brand, department_id);

-- ═══════════════════════════════════════════════════════════════
-- LANGKAH 3 — 37 kolom yang hilang
-- ═══════════════════════════════════════════════════════════════
--
-- Tipe, DEFAULT, dan NULLABILITY diambil apa adanya dari
-- information_schema Supabase -- bukan ditebak.

-- users (8)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS address_ktp         text,
  ADD COLUMN IF NOT EXISTS department          text,
  ADD COLUMN IF NOT EXISTS emergency_contact   text,
  ADD COLUMN IF NOT EXISTS phone_wa            text,
  ADD COLUMN IF NOT EXISTS status              text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS ttl                 text,
  ADD COLUMN IF NOT EXISTS urgent_balance      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS urgent_quota        integer NOT NULL DEFAULT 1;

-- leave_requests (15) -- persetujuan 2 tahap
--
-- CATATAN TIPE: di Supabase `*_approved_by` bertipe uuid, tapi
-- `users.id` di skema kita bertype TEXT. Foreign key tidak bisa
-- menyambung uuid ke text -- PostgreSQL menolaknya dengan
-- "incompatible types". Jadi kolomnya dibuat varchar, konsisten
-- dengan 21 kolom user lain yang sudah ada di skema kita.
-- Melihat daftar kolom users.id sebelum menulis kolom FK.
ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS deducted_urgent            integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS executive_status           text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS executive_approved_by      varchar(255),
  ADD COLUMN IF NOT EXISTS executive_approved_by_name text,
  ADD COLUMN IF NOT EXISTS executive_approved_at      timestamptz,
  ADD COLUMN IF NOT EXISTS executive_notes             text,
  ADD COLUMN IF NOT EXISTS hr_status                  text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS hr_approved_by             varchar(255),
  ADD COLUMN IF NOT EXISTS hr_approved_by_name        text,
  ADD COLUMN IF NOT EXISTS hr_approved_at             timestamptz,
  ADD COLUMN IF NOT EXISTS hr_notes                   text,
  ADD COLUMN IF NOT EXISTS rejection_stage            text,
  ADD COLUMN IF NOT EXISTS rejection_reason           text,
  ADD COLUMN IF NOT EXISTS rejected_by                text,
  ADD COLUMN IF NOT EXISTS rejected_at                timestamptz;

-- overtime_requests (4) — warisan tarif per transaksi.
-- TIDAK dipakai menghitung: tarif dihitung di server. Disimpan
-- hanya supaya riwayat lamanya ikut terbawa.
ALTER TABLE overtime_requests
  ADD COLUMN IF NOT EXISTS first_hour_rate        numeric,
  ADD COLUMN IF NOT EXISTS first_hour_pay         numeric,
  ADD COLUMN IF NOT EXISTS subsequent_hour_rate   numeric,
  ADD COLUMN IF NOT EXISTS subsequent_hour_pay    numeric;

-- absensi_settings (2)
ALTER TABLE absensi_settings
  ADD COLUMN IF NOT EXISTS default_urgent_quota    integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_urgent_reset_month text;

-- kpis (2) — keduanya warisan: semua 2018 baris category='quantity'
ALTER TABLE kpis
  ADD COLUMN IF NOT EXISTS category   varchar(32) NOT NULL DEFAULT 'quantity',
  ADD COLUMN IF NOT EXISTS department text;

-- kpi_assignments (2) — warisan
ALTER TABLE kpi_assignments
  ADD COLUMN IF NOT EXISTS notes  text,
  ADD COLUMN IF NOT EXISTS weight numeric NOT NULL DEFAULT 0;

-- kpi_settings (2) — `quantity_weight` warisan, semua 46 baris = 60
--
-- PENTING soal DEFAULT: `id` harus punya DEFAULT gen_random_uuid(),
-- sama seperti di src/db/schema.ts. Versi pertama file ini menambah
-- kolomnya TANPA default lalu hanya mengisi baris yang sudah ada --
-- jadi DEFAULT-nya hilang, dan setiap INSERT baru yang tidak
-- menyebut `id` gagal dengan "null value in column id".
-- Gejalanya muncul sebagai 500 di /api/kpi-settings, jauh dari
-- penyebabnya.
ALTER TABLE kpi_settings
  ADD COLUMN IF NOT EXISTS id              uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS quantity_weight numeric NOT NULL DEFAULT 60;

-- Kalau kolomnya sudah ada dari versi lama file ini, defaultnya
-- belum terpasang -- pasang sekarang.
ALTER TABLE kpi_settings
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- monthly_scores (1) — BEDA dari kpi_assignments.quality_notes
ALTER TABLE monthly_scores
  ADD COLUMN IF NOT EXISTS quality_notes text;

-- department_locations (1)
ALTER TABLE department_locations
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- ═══════════════════════════════════════════════════════════════
-- LANGKAH 4 — Normalisasi tipe kolom FK
-- ═══════════════════════════════════════════════════════════════
--
-- `ADD COLUMN IF NOT EXISTS` TIDAK memperbaiki kolom yang sudah ada
-- dengan tipe yang salah. Run pertama file ini sempat membuat
-- executive_approved_by sebagai uuid (menyalin definisi Supabase),
-- padahal `users.id` di sini bertipe text — jadi kolom itu tertinggal
-- uuid, dan langkah FK selalu gagal dengan "incompatible types".
--
-- Run kedua melihat "sudah ada, skipping" dan tidak pernah
-- memperbaikinya. Langkah ini menormalkan tipenya secara eksplisit,
-- jadi aman di database yang sudah pernah menjalankan versi lama file
-- ini maupun yang belum pernah sama sekali.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'leave_requests'
       AND column_name = 'executive_approved_by'
       AND data_type <> 'character varying'
  ) THEN
    EXECUTE 'ALTER TABLE leave_requests
             ALTER COLUMN executive_approved_by TYPE varchar(255)
             USING executive_approved_by::text';
    RAISE NOTICE 'leave_requests.executive_approved_by -> varchar(255)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'leave_requests'
       AND column_name = 'hr_approved_by'
       AND data_type <> 'character varying'
  ) THEN
    EXECUTE 'ALTER TABLE leave_requests
             ALTER COLUMN hr_approved_by TYPE varchar(255)
             USING hr_approved_by::text';
    RAISE NOTICE 'leave_requests.hr_approved_by -> varchar(255)';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- LANGKAH 5 — Backfill & kunci untuk kpi_settings.id
-- ═══════════════════════════════════════════════════════════════
--
-- Di Supabase `id` adalah primary key-nya. Di sini primary key tetap
-- `user_id` supaya kode yang sudah ada tidak berubah -- jadi `id`
-- hanya perlu UNIQUE. Kolomnya diisi DEFAULT gen_random_uuid(),
-- jadi baris yang sudah ada ikut terisi.

UPDATE kpi_settings SET id = gen_random_uuid() WHERE id IS NULL;

ALTER TABLE kpi_settings ALTER COLUMN id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'kpi_settings_id_unique'
  ) THEN
    ALTER TABLE kpi_settings
      ADD CONSTRAINT kpi_settings_id_unique UNIQUE (id);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- LANGKAH 6 — Dua foreign key persetujuan
-- ═══════════════════════════════════════════════════════════════
--
-- Kolomnya varchar(255) -- lihat catatan tipe di LANGKAH 3. Di Supabase
-- kolomnya uuid, tapi `users.id` di sini text, dan PostgreSQL menolak
-- foreign key yang menyambung uuid ke text.
--
-- ON DELETE SET NULL, bukan CASCADE: riwayat persetujuan tidak boleh
-- ikut hilang kalau ada user yang dihapus. Kolom approved_by jadi NULL,
-- tapi executive_approved_by_name tetap menyisakan nama -- jadi jejaknya
-- masih terlihat.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'leave_requests_executive_approved_by_fkey'
  ) THEN
    ALTER TABLE leave_requests
      ADD CONSTRAINT leave_requests_executive_approved_by_fkey
      FOREIGN KEY (executive_approved_by) REFERENCES users(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'leave_requests_hr_approved_by_fkey'
  ) THEN
    ALTER TABLE leave_requests
      ADD CONSTRAINT leave_requests_hr_approved_by_fkey
      FOREIGN KEY (hr_approved_by) REFERENCES users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- HASIL
-- ═══════════════════════════════════════════════════════════════

-- Daftar (tabel, kolom) yang harus ada setelah migrasi ini.
-- Hanya ditulis SEKALI lalu dipakai untuk dua pertanyaan: berapa yang
-- terpasang, dan mana yang belum. Versi pertama menulis daftarnya dua
-- kali secara terpisah, dan keduanya tidak sinkron -- jumlah yang
-- dipasang dibandingkan terhadap daftar yang berbeda dari yang dicek.
DO $$
DECLARE
  v_expected int;
  v_actual   int;
  v_missing  text;
BEGIN
  WITH want(t, c) AS (VALUES
    ('users','address_ktp'), ('users','department'),
    ('users','emergency_contact'), ('users','phone_wa'),
    ('users','status'), ('users','ttl'),
    ('users','urgent_balance'), ('users','urgent_quota'),
    ('leave_requests','deducted_urgent'),
    ('leave_requests','executive_status'),
    ('leave_requests','executive_approved_by'),
    ('leave_requests','executive_approved_by_name'),
    ('leave_requests','executive_approved_at'),
    ('leave_requests','executive_notes'),
    ('leave_requests','hr_status'),
    ('leave_requests','hr_approved_by'),
    ('leave_requests','hr_approved_by_name'),
    ('leave_requests','hr_approved_at'),
    ('leave_requests','hr_notes'),
    ('leave_requests','rejection_stage'),
    ('leave_requests','rejection_reason'),
    ('leave_requests','rejected_by'),
    ('leave_requests','rejected_at'),
    ('overtime_requests','first_hour_rate'),
    ('overtime_requests','first_hour_pay'),
    ('overtime_requests','subsequent_hour_rate'),
    ('overtime_requests','subsequent_hour_pay'),
    ('absensi_settings','default_urgent_quota'),
    ('absensi_settings','last_urgent_reset_month'),
    ('kpis','category'), ('kpis','department'),
    ('kpi_assignments','notes'), ('kpi_assignments','weight'),
    ('kpi_settings','id'), ('kpi_settings','quantity_weight'),
    ('monthly_scores','quality_notes'),
    ('department_locations','created_at')
  )
  SELECT count(*) INTO v_expected FROM want;

  WITH want(t, c) AS (VALUES
    ('users','address_ktp'), ('users','department'),
    ('users','emergency_contact'), ('users','phone_wa'),
    ('users','status'), ('users','ttl'),
    ('users','urgent_balance'), ('users','urgent_quota'),
    ('leave_requests','deducted_urgent'),
    ('leave_requests','executive_status'),
    ('leave_requests','executive_approved_by'),
    ('leave_requests','executive_approved_by_name'),
    ('leave_requests','executive_approved_at'),
    ('leave_requests','executive_notes'),
    ('leave_requests','hr_status'),
    ('leave_requests','hr_approved_by'),
    ('leave_requests','hr_approved_by_name'),
    ('leave_requests','hr_approved_at'),
    ('leave_requests','hr_notes'),
    ('leave_requests','rejection_stage'),
    ('leave_requests','rejection_reason'),
    ('leave_requests','rejected_by'),
    ('leave_requests','rejected_at'),
    ('overtime_requests','first_hour_rate'),
    ('overtime_requests','first_hour_pay'),
    ('overtime_requests','subsequent_hour_rate'),
    ('overtime_requests','subsequent_hour_pay'),
    ('absensi_settings','default_urgent_quota'),
    ('absensi_settings','last_urgent_reset_month'),
    ('kpis','category'), ('kpis','department'),
    ('kpi_assignments','notes'), ('kpi_assignments','weight'),
    ('kpi_settings','id'), ('kpi_settings','quantity_weight'),
    ('monthly_scores','quality_notes'),
    ('department_locations','created_at')
  )
  SELECT count(*) INTO v_actual
    FROM want w
    JOIN information_schema.columns ic
      ON ic.table_schema = 'public'
     AND ic.table_name = w.t
     AND ic.column_name = w.c;

  WITH want(t, c) AS (VALUES
    ('users','address_ktp'), ('users','department'),
    ('users','emergency_contact'), ('users','phone_wa'),
    ('users','status'), ('users','ttl'),
    ('users','urgent_balance'), ('users','urgent_quota'),
    ('leave_requests','deducted_urgent'),
    ('leave_requests','executive_status'),
    ('leave_requests','executive_approved_by'),
    ('leave_requests','executive_approved_by_name'),
    ('leave_requests','executive_approved_at'),
    ('leave_requests','executive_notes'),
    ('leave_requests','hr_status'),
    ('leave_requests','hr_approved_by'),
    ('leave_requests','hr_approved_by_name'),
    ('leave_requests','hr_approved_at'),
    ('leave_requests','hr_notes'),
    ('leave_requests','rejection_stage'),
    ('leave_requests','rejection_reason'),
    ('leave_requests','rejected_by'),
    ('leave_requests','rejected_at'),
    ('overtime_requests','first_hour_rate'),
    ('overtime_requests','first_hour_pay'),
    ('overtime_requests','subsequent_hour_rate'),
    ('overtime_requests','subsequent_hour_pay'),
    ('absensi_settings','default_urgent_quota'),
    ('absensi_settings','last_urgent_reset_month'),
    ('kpis','category'), ('kpis','department'),
    ('kpi_assignments','notes'), ('kpi_assignments','weight'),
    ('kpi_settings','id'), ('kpi_settings','quantity_weight'),
    ('monthly_scores','quality_notes'),
    ('department_locations','created_at')
  )
  SELECT string_agg(w.t || '.' || w.c, ', ') INTO v_missing
    FROM want w
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns ic
      WHERE ic.table_schema = 'public'
        AND ic.table_name = w.t
        AND ic.column_name = w.c
   );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Migrasi 0014 GAGAL. % dari % kolom tidak ada: %',
      v_expected - v_actual, v_expected, v_missing;
  END IF;

  RAISE NOTICE 'Migrasi 0014 OK: % dari % kolom terpasang.',
    v_actual, v_expected;
END $$;