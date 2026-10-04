-- 0016_widen_achievement_percentage.sql
--
-- Melebarkan kpi_assignments.achievement_percentage dari numeric(7,2)
-- menjadi numeric(15,2).
--
-- ALASAN
--
-- Dry run migrasi data (0015) berhenti dengan:
--
--   ERROR: numeric field overflow
--   DETAIL: A field with precision 7, scale 2 must round to an absolute
--           value less than 10^5.
--
-- Penyebabnya bukan data rusak, tapi kolom yang lebih sempit dari data.
-- Ada 3 dari 2707 assignment dengan achievement_percentage lebih besar
-- dari 99999.99, nilai terbesar 891707.64:
--
--   891707.64   actual_total 222926909   expected_total 0
--   640686.81   actual_total 961030213.42 expected_total 0
--   188678.89   actual_total 830187107.11 expected_total 0
--
-- Ketiganya expected_total = 0, jadi pace rate membagi dengan nol dan
-- angkanya meledak. expected_total 0 itu sendiri sudah diketahui sebagai
-- bug: working_days_elapsed tidak pernah diisi di mana pun (AGENTS.md
-- §3.6). Jadi angka sebesar 891707.64% itu konsekuensi bug yang tidak
-- ikut selesai di migrasi ini.
--
-- Yang TIDAK dilakukan di sini: memotong, membulatkan, atau meng-NULL
-- baris tersebut. Memotongnya berarti kehilangan data, dan angka hasil
-- potong (891707.64 -> 891707.64, kebetulan muat; tapi yang 961030213.42
-- di kolom lain sudah tidak muat) akan terlihat masuk akal padahal salah.
-- Migrasi data harus memindahkan apa yang ada.
--
-- monthly_scores.achievement_percentage TIDAK diubah di sini. Nilainya
-- paling besar 2800, jadi muat di numeric(7,2). Melebarkannya tanpa
-- alasan hanya menambah ruang untuk kesalahan.
--
-- -- APAKAH INI AKHIRNYA MEMPERBAIKAN MASALAHNYA?

-- Tidak. Numerik yang muat semua nilai yang mungkin muncul, dan tidak
-- ada memotong angka yang sudah tercatat. Kalau nanti
-- working_days_elapsed diperbaiki, expected_total tidak lagi nol dan
-- pace rate kembali ke rentang yang wajar. Tapi sampai itu terjadi,
-- tiga baris itu akan tetap menampilkan angka sebesar 891707.64%.
--
-- IDEMPOTEN
--
-- Boleh dijalankan berkali-kali: mengubah kolom ke numeric(15,2) ketika
-- sudah numeric(15,2) tidak melakukan apa pun dan tidak gagal.
-- Kolom bisa jadi tidak ada kalau migrasi ini dijalankan pada database
-- yang belum punya tabel kpi_assignments, jadi tidak ada cek kektu.

DO $$
BEGIN
  IF to_regclass('public.kpi_assignments') IS NULL THEN
    RAISE NOTICE 'kpi_assignments belum ada, dilewati.';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'kpi_assignments'
       AND column_name = 'achievement_percentage'
       AND (numeric_precision < 15 OR numeric_precision IS NULL)
  ) THEN
    ALTER TABLE public.kpi_assignments
      ALTER COLUMN achievement_percentage TYPE numeric(15,2)
      USING achievement_percentage::numeric(15,2);
    RAISE NOTICE 'kpi_assignments.achievement_percentage dilebarkan ke numeric(15,2).';
  ELSE
    RAISE NOTICE 'kpi_assignments.achievement_percentage sudah numeric(15,2) atau lebih lebar.';
  END IF;
END $$;

-- Bukti, bukan laporan. Kalau ada nilai yang tidak muat, ALTER di atas
-- sudah gagal dan kita tidak akan sampai ke sini.
DO $$
DECLARE
  lebar integer;
  terbesar numeric;
BEGIN
  SELECT numeric_precision INTO lebar
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'kpi_assignments'
     AND column_name = 'achievement_percentage';

  SELECT max(achievement_percentage) INTO terbesar FROM public.kpi_assignments;

  RAISE NOTICE 'presisi sekarang %; nilai terbesar %', lebar, terbesar;

  IF terbesar IS NOT NULL AND abs(terbesar) >= power(10, lebar - 2) THEN
    RAISE EXCEPTION
      'nilai terbesar % masih tidak muat di numeric(%,2)',
      terbesar, lebar;
  END IF;
END $$;
