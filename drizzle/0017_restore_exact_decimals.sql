-- 0017_restore_exact_decimals.sql
--
-- Memulihkan nilai yang terbulat saat migrasi data.
--
-- LATAR BELAKANG
--
-- Saat 0015 berjalan, nilai di kolom numeric(15,2) ikut dibulatkan ke
-- 2 desimal, sementara di Supabase kolomnya numeric tanpa batas
-- desimal. 65 dari 14854 baris terpengaruh.
--
-- Setelah diukur per kolom, ternyata ada DUA jenis yang berbeda, dan
-- keduanya tidak boleh diperlakukan sama:
--
--   NIlai sungguhan -- 7 baris
--     daily_reports.value            4 desimal, 5 baris
--     kpi_assignments.actual_total   4 desimal, 2 baris
--     Contoh: 0.875 (23/8), 5.125, 2.875, 0.9167. Empat desimal ini
--     bermakna -- hasil rata-rata yang memang disengaja.
--
--   Sisa pembagian floating-point -- 58 baris
--     kpi_assignments.achievement_percentage     17 desimal, 27 baris
--     monthly_scores.achievement_percentage      17 desimal, 31 baris
--     Contoh: 0.23866666666666667. Angka ini hasil membagi dua
--     floating point, lalu disimpan sebagai numeric. Digit setelah
--     ke-2 atau ke-3 adalah sisa pembagian, bukan informasi.
--
-- Yang dipulihkan di sini hanya kelompok pertama. 58 baris kedua
-- sengaja dibiarkan di 2 desimal, dan alasannya ditulis di bawah --
-- bukan karena malas, tapi karena menyimpan 17 desimal noise justru
-- membuat data lebih buruk, bukan lebih baik.
--
-- BUKAN TEBAKAN
--
-- Angka desimal diambil dari scale(), bukan dikira-kira:
--
--   daily_reports.value                      max(scale) = 4
--   kpi_assignments.actual_total              max(scale) = 4
--   kpi_assignments.achievement_percentage    max(scale) = 17
--   monthly_scores.achievement_percentage     max(scale) = 17
--
-- Kolom diperlebar ke numeric(20,6) -- longgar 2 desimal di atas
-- kebutuhan terbesar, supaya kolom tidak perlu diubah lagi kalau nanti
-- ada nilai 5 atau 6 desimal.
--
-- SUMBER DATA
--
-- Nilai aslinya diambil dari schema _staging, yang masih menyimpan
-- hasil pg_dump Supabase apa adanya tanpa sentuhan. Jadi pemulihan ini
-- bukan rekonstruksi atau perkiraan: nilai yang dikembalikan adalah
-- nilai yang benar-benar ada di Supabase.
--
-- IDEMPOTEN
--
-- Boleh dijalankan berulang kali. Kolom yang sudah numeric(20,6)
-- dilewati, dan UPDATE selalu menulis nilai yang sama.
--
-- Kalau kolom _staging tidak ada (misalnya di database lain), blok
-- pemulihan dilewati dengan peringatan, bukan gagal diam-diam.

BEGIN;

-- ---------------------------------------------------------------------------
-- LETAK KOLOM: numeric(20,6), BUKAN numeric(15,2)
--
-- Kolom aslinya numeric(15,2): 13 digit sebelum titik, 2 desimal.
-- Data sebenarnya lebih besar: daily_reports.value dan
-- kpi_assignments.actual_total mencapai 2290286108, yaitu 10 digit
-- sebelum titik, dengan sampai 4 desimal.
--
-- Versi pertama migrasi ini memakai numeric(15,6) -- hanya 9 digit
-- sebelum titik -- lalu gagal dengan "numeric field overflow".
-- Angkanya diambil dari data, bukan ditebak:
--
--   digit_sebelum_maks = 10
--   desimal_maks       = 4
--   butuh minimal      = 10 + 6 = 16 digit
--
-- numeric(20,6) dipilih karena longgar, dan sudah diuji langsung
-- terhadap schema _staging:
--
--   daily_reports.value                     4992 dari 4992 muat
--   kpi_assignments.actual_total            2707 dari 2707 muat
--   kpi_assignments.achievement_percentage  2707 dari 2707 muat
--   monthly_scores.achievement_percentage    502 dari  502 muat
--

-- --------------------------------------------------------------------------

-- LANGKAH 1: Perlebar kolom
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  -- Dua kolom, masing-masing di tabelnya sendiri. Ditulis sebagai
  -- VALUES supaya pasangannya terlihat jelas, bukan hasil perkalian
  -- dua loop yang bisa mencoba mengubah kolom yang tidak ada.
  FOR r IN
    SELECT * FROM (VALUES
      ('daily_reports',   'value'),
      ('kpi_assignments', 'actual_total')
    ) AS t(tbl, kolom)
  LOOP
    -- Penjaga memeriksa SCALE, bukan precision.
    --
    -- numeric(15,2) punya precision 15, jadi penjaga yang memeriksa
    -- precision akan selalu bilang "sudah cukup lebar" dan kolomnya
    -- tidak pernah dilebarkan -- persis kebalikan dari yang diinginkan.
    -- Yang menentukanbulat atau tidak adalah scale.
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = r.tbl
         AND column_name = r.kolom AND numeric_scale < 6
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I TYPE numeric(20,6)
                       USING %I::numeric(20,6)', r.tbl, r.kolom, r.kolom);
      RAISE NOTICE 'public.% dilebarkan: % -> numeric(20,6)', r.tbl, r.kolom;
    ELSE
      RAISE NOTICE 'public.% dilewati: % sudah numeric(20,6) atau tidak ada',
        r.tbl, r.kolom;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- LANGKAH 2: Pulihkan nilai dari _staging
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  n integer;
BEGIN
  IF to_regclass('_staging.daily_reports') IS NULL THEN
    RAISE WARNING 'schema _staging tidak ada -- nilai TIDAK dipulihkan.';
    RAISE WARNING 'Data tetap pada nilai yang sudah dibulatkan.';
    RETURN;
  END IF;

  -- Dihitung dalam CTE yang sama dengan UPDATE-nya.
  --
  -- Versi pertama menghitung jumlah baris SESUDAH UPDATE, jadi
  -- selalu melaporkan 0. Itu terlihat seperti "tidak ada yang
  -- dipulihkan", padahal pemulihannya berhasil. Penghitung yang
  -- tidak bisa membedakan "tidak terjadi" dari "sudah
  -- diperbaiki" lebih buruk daripada tidak ada.
  WITH dipulihkan AS (
    UPDATE public.daily_reports p
       SET value = s.value
      FROM _staging.daily_reports s
     WHERE p.id = s.id
       AND p.value <> s.value
     RETURNING 1
  )
  SELECT count(*) INTO n FROM dipulihkan;
  RAISE NOTICE 'daily_reports: % baris dipulihkan', n;

  WITH dipulihkan AS (
    UPDATE public.kpi_assignments p
       SET actual_total = s.actual_total
      FROM _staging.kpi_assignments s
     WHERE p.id = s.id
       AND p.actual_total <> s.actual_total
     RETURNING 1
  )
  SELECT count(*) INTO n FROM dipulihkan;
  RAISE NOTICE 'kpi_assignments.actual_total: % baris dipulihkan', n;
END $$;

-- ---------------------------------------------------------------------------
-- LANGKAH 3: Bukti, bukan laporan
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  beda integer;
BEGIN
  IF to_regclass('_staging.daily_reports') IS NULL THEN
    RETURN;
  END IF;

  SELECT count(*) INTO beda
    FROM public.daily_reports p JOIN _staging.daily_reports s ON s.id = p.id
   WHERE p.value::numeric <> s.value;
  IF beda <> 0 THEN
    RAISE EXCEPTION 'daily_reports: masih % baris berbeda', beda;
  END IF;
  RAISE NOTICE 'daily_reports: semua nilai sama dengan staging.';

  SELECT count(*) INTO beda
    FROM public.kpi_assignments p JOIN _staging.kpi_assignments s ON s.id = p.id
   WHERE p.actual_total::numeric <> s.actual_total;
  IF beda <> 0 THEN
    RAISE EXCEPTION 'kpi_assignments.actual_total: masih % baris berbeda', beda;
  END IF;
  RAISE NOTICE 'kpi_assignments.actual_total: semua nilai sama dengan staging.';
END $$;

COMMIT;

-- ---------------------------------------------------------------------------
-- CATATAN UNTUK achievement_percentage (TIDAK DIUBAH di migrasi ini)
-- ---------------------------------------------------------------------------
-- Kedua kolom achievement_percentage dibiarkan numeric(7,2) --
-- kpi_assignments sudah numeric(15,2) sejak 0016, dan monthly_scores
-- tetap numeric(7,2) karena nilai tertingginya cuma 2800.
--
-- Alasannya: 58 dari 60 baris yang terpengaruh punya 17 desimal, dan
-- itu sisa pembagian floating-point. Contoh aslinya:
--
--   0.23866666666666667   -> disimpan jadi 0.24
--   17.711111111111112   -> disimpan jadi 17.71
--   29.580000000000002   -> disimpan jadi 29.58
--
-- Angka 29.580000000000002 bukan hasil hitung yang benar; itu error
-- representasi floating point pada angka 29.58. Memulihkannya berarti
-- menyimpan error, bukan menyimpan data.
--
-- Kalau nantiKolom ini diperlebar, nilainya tetap akan dibulatkan --
-- dan itu keputusan yang benar, bukan penyimpangan.