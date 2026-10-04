-- Berapa desimal sebenarnya yang dibutuhkan?
--
-- Versi pertama memakai fungsi fiktif `ekstensi_desimal` yang tidak
-- ada. Fungsi yang benar untuk PostgreSQL adalah scale(): ia
-- mengembalikan jumlah digit di belakang titik pada representasi
-- minimal sebuah numeric. Tepat untuk keperluan ini.

\pset pager off

\echo '=== 1. Desimal per kolom yang terpengaruh ==='
SELECT 'daily_reports.value' AS kolom,
       max(scale(value)) AS desimal_maks,
       count(*) FILTER (WHERE value <> round(value, 2)) AS baris_terpengaruh
  FROM _staging.daily_reports
UNION ALL
SELECT 'kpi_assignments.achievement_percentage',
       max(scale(achievement_percentage)),
       count(*) FILTER (WHERE achievement_percentage <> round(achievement_percentage, 2))
  FROM _staging.kpi_assignments
UNION ALL
SELECT 'kpi_assignments.actual_total',
       max(scale(actual_total)),
       count(*) FILTER (WHERE actual_total <> round(actual_total, 2))
  FROM _staging.kpi_assignments
UNION ALL
SELECT 'monthly_scores.achievement_percentage',
       max(scale(achievement_percentage)),
       count(*) FILTER (WHERE achievement_percentage <> round(achievement_percentage, 2))
  FROM _staging.monthly_scores
 ORDER BY 1;

\echo ''
\echo '=== 2. Nilai dengan desimal terbanyak ==='
SELECT s.id,
       s.value::text AS di_supabase,
       p.value::text AS sekarang,
       (p.value::text::numeric - s.value) AS selisih
  FROM _staging.daily_reports s
  JOIN public.daily_reports p ON p.id = s.id
 WHERE s.value <> round(s.value, 2)
 ORDER BY scale(s.value) DESC, s.id
 LIMIT 5;

SELECT s.id, s.year, s.month,
       s.achievement_percentage::text AS di_supabase,
       p.achievement_percentage::text AS sekarang
  FROM _staging.kpi_assignments s
  JOIN public.kpi_assignments p ON p.id = s.id
 WHERE s.achievement_percentage <> round(s.achievement_percentage, 2)
 ORDER BY scale(s.achievement_percentage) DESC, s.id
 LIMIT 5;

\echo ''
\echo '=== 3. Kalau kolom dilCBBarkan ke scale 6, masih ada yang dibulatkan? ==='
\echo '  (harus nol semua; kalau tidak, scale 6 juga tidak cukup)'
SELECT 'daily_reports.value' AS kolom,
       count(*) FILTER (WHERE value <> round(value, 6)) AS akan_dibulatkan
  FROM _staging.daily_reports
UNION ALL
SELECT 'kpi_assignments.achievement_percentage',
       count(*) FILTER (WHERE achievement_percentage <> round(achievement_percentage, 6))
  FROM _staging.kpi_assignments
UNION ALL
SELECT 'kpi_assignments.actual_total',
       count(*) FILTER (WHERE actual_total <> round(actual_total, 6))
  FROM _staging.kpi_assignments
UNION ALL
SELECT 'monthly_scores.achievement_percentage',
       count(*) FILTER (WHERE achievement_percentage <> round(achievement_percentage, 6))
  FROM _staging.monthly_scores
 ORDER BY 1;

\echo ''
\echo '=== 4. Kalau kolom TIDAK diubah, berapa nilai yang benar-benar berbeda? ==='
\echo '  (ini yang akan dipulihkan kalau kita restore dari staging)'
SELECT 'daily_reports.value' AS kolom,
       count(*) AS nilai_berbeda
  FROM _staging.daily_reports s
  JOIN public.daily_reports p ON p.id = s.id
 WHERE p.value::numeric <> s.value
UNION ALL
SELECT 'kpi_assignments.achievement_percentage',
       count(*)
  FROM _staging.kpi_assignments s
  JOIN public.kpi_assignments p ON p.id = s.id
 WHERE p.achievement_percentage::numeric <> s.achievement_percentage
UNION ALL
SELECT 'kpi_assignments.actual_total',
       count(*)
  FROM _staging.kpi_assignments s
  JOIN public.kpi_assignments p ON p.id = s.id
 WHERE p.actual_total::numeric <> s.actual_total
UNION ALL
SELECT 'monthly_scores.achievement_percentage',
       count(*)
  FROM _staging.monthly_scores s
  JOIN public.monthly_scores p ON p.id = s.id
 WHERE p.achievement_percentage::numeric <> s.achievement_percentage
 ORDER BY 1;