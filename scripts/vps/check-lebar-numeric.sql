-- numeric(15,6) ternyata tidak cukup.
--
-- Di numeric(p,s), p adalah JUMLAH digit (sebelum + sesudah titik).
-- Jadi numeric(15,6) hanya muat 9 digit sebelum titik. Nilai seperti
-- 961030213.42 memakai 9 digit sebelum titik dan butuh 6 setelahnya
-- untuk total 15 -- pas di batas. Tapi kalau ada nilai yang lebih
-- besar atau lebih desimal, p Overflow.
--
-- Precision dan scale harus dihitung dari data, bukan ditebak.

\pset pager off

\echo '=== 1. Berapa digit sebelum dan sesudah titik, per kolom? ==='
SELECT 'daily_reports.value' AS kolom,
       max(length(regexp_replace(abs(value)::text, '\..*$', ''))) AS digit_sebelum_maks,
       max(scale(value)) AS desimal_maks,
       max(abs(value)) AS nilai_maks,
       max(abs(value))::text AS nilai_maks_teks
  FROM _staging.daily_reports
UNION ALL
SELECT 'kpi_assignments.actual_total',
       max(length(regexp_replace(abs(actual_total)::text, '\..*$', ''))),
       max(scale(actual_total)),
       max(abs(actual_total)),
       max(abs(actual_total))::text
  FROM _staging.kpi_assignments
UNION ALL
SELECT 'kpi_assignments.achievement_percentage',
       max(length(regexp_replace(abs(achievement_percentage)::text, '\..*$', ''))),
       max(scale(achievement_percentage)),
       max(abs(achievement_percentage)),
       max(abs(achievement_percentage))::text
  FROM _staging.kpi_assignments
UNION ALL
SELECT 'monthly_scores.achievement_percentage',
       max(length(regexp_replace(abs(achievement_percentage)::text, '\..*$', ''))),
       max(scale(achievement_percentage)),
       max(abs(achievement_percentage)),
       max(abs(achievement_percentage))::text
  FROM _staging.monthly_scores
UNION ALL
SELECT 'monthly_scores.actual_total',
       max(length(regexp_replace(abs(actual_total)::text, '\..*$', ''))),
       max(scale(actual_total)),
       max(abs(actual_total)),
       max(abs(actual_total))::text
  FROM _staging.monthly_scores
 ORDER BY 1;

\echo ''
\echo '=== 2. Berapa digit sebelum titik di produksi SEKARANG? ==='
SELECT 'daily_reports.value' AS kolom,
       max(length(regexp_replace(abs(value)::text, '\..*$', ''))) AS digit_maks
  FROM public.daily_reports
UNION ALL
SELECT 'kpi_assignments.actual_total',
       max(length(regexp_replace(abs(actual_total)::text, '\..*$', '')))
  FROM public.kpi_assignments
UNION ALL
SELECT 'kpi_assignments.achievement_percentage',
       max(length(regexp_replace(abs(achievement_percentage)::text, '\..*$', '')))
  FROM public.kpi_assignments
 ORDER BY 1;

\echo ''
\echo '=== 3. Uji langsung: numeric(20,6) cukup atau tidak? ==='
SELECT 'daily_reports.value -> numeric(20,6)' AS kolom,
       count(value::numeric(20,6)) AS jumlah,
       count(*) AS total,
       CASE WHEN count(value::numeric(20,6)) = count(*) THEN 'MUAT' ELSE 'TIDAK MUAT' END AS hasil
  FROM _staging.daily_reports
UNION ALL
SELECT 'kpi_assignments.actual_total -> numeric(20,6)',
       count(actual_total::numeric(20,6)), count(*),
       CASE WHEN count(actual_total::numeric(20,6)) = count(*) THEN 'MUAT' ELSE 'TIDAK MUAT' END
  FROM _staging.kpi_assignments
UNION ALL
SELECT 'kpi_assignments.achievement_percentage -> numeric(20,6)',
       count(achievement_percentage::numeric(20,6)), count(*),
       CASE WHEN count(achievement_percentage::numeric(20,6)) = count(*) THEN 'MUAT' ELSE 'TIDAK MUAT' END
  FROM _staging.kpi_assignments
UNION ALL
SELECT 'monthly_scores.achievement_percentage -> numeric(20,6)',
       count(achievement_percentage::numeric(20,6)), count(*),
       CASE WHEN count(achievement_percentage::numeric(20,6)) = count(*) THEN 'MUAT' ELSE 'TIDAK MUAT' END
  FROM _staging.monthly_scores
 ORDER BY 1;