-- Dua agregat berbeda 0.02 antara staging dan produksi:
--   daily_reports.value              18295868428.74 -> .76
--   monthly_scores.achievement_percentage  50526.99 -> 50527.01
--
-- Penyebabnya casting ke numeric(15,2): nilai staging tidak dibatasi
-- desimalnya, jadi nilai seperti 123.456 menjadi 123.46 dan selisihnya
-- menumpuk di SUM.
--
-- Ini perubahan angka -- kecil, tapi bukan nol. Kalaureally tidak ada
-- nilai yang punya lebih dari 2 desimal, tidak akan ada selisih.
-- Jadi pertanyaannya: berapa banyak baris yang benar-benar terpengaruh,
-- dan apakah ada kolom lain yang lebih parah.

\pset pager off

\echo '=== 1. Berapa nilai yang punya lebih dari 2 desimal? ==='

SELECT 'daily_reports.value' AS kolom,
       count(*) FILTER (WHERE value <> round(value, 2)) AS lebih_dari_2_desimal,
       count(*) AS total,
       max(abs(value - round(value, 2))) AS selisih_maks
  FROM _staging.daily_reports
UNION ALL
SELECT 'monthly_scores.achievement_percentage',
       count(*) FILTER (WHERE achievement_percentage <> round(achievement_percentage, 2)),
       count(*),
       max(abs(achievement_percentage - round(achievement_percentage, 2)))
  FROM _staging.monthly_scores
UNION ALL
SELECT 'monthly_scores.actual_total',
       count(*) FILTER (WHERE actual_total <> round(actual_total, 2)),
       count(*),
       max(abs(actual_total - round(actual_total, 2)))
  FROM _staging.monthly_scores
UNION ALL
SELECT 'monthly_scores.monthly_target',
       count(*) FILTER (WHERE monthly_target <> round(monthly_target, 2)),
       count(*),
       max(abs(monthly_target - round(monthly_target, 2)))
  FROM _staging.monthly_scores
UNION ALL
SELECT 'kpi_assignments.achievement_percentage',
       count(*) FILTER (WHERE achievement_percentage <> round(achievement_percentage, 2)),
       count(*),
       max(abs(achievement_percentage - round(achievement_percentage, 2)))
  FROM _staging.kpi_assignments
UNION ALL
SELECT 'kpi_assignments.actual_total',
       count(*) FILTER (WHERE actual_total <> round(actual_total, 2)),
       count(*),
       max(abs(actual_total - round(actual_total, 2)))
  FROM _staging.kpi_assignments
UNION ALL
SELECT 'kpi_assignments.monthly_target',
       count(*) FILTER (WHERE monthly_target <> round(monthly_target, 2)),
       count(*),
       max(abs(monthly_target - round(monthly_target, 2)))
  FROM _staging.kpi_assignments
UNION ALL
SELECT 'kpis.monthly_target',
       count(*) FILTER (WHERE monthly_target <> round(monthly_target, 2)),
       count(*),
       max(abs(monthly_target - round(monthly_target, 2)))
  FROM _staging.kpis
 ORDER BY 1;

\echo ''
\echo '=== 2. Contoh nilai yang dibulatkan ==='

SELECT id, value AS di_supabase, round(value, 2) AS setelah_dibulatkan
  FROM _staging.daily_reports
 WHERE value <> round(value, 2)
 ORDER BY abs(value - round(value, 2)) DESC
 LIMIT 5;

\echo ''
\echo '=== 3. Semua kolom numeric di produksi yang akan membulatkan ==='
\echo '  Dibanding dengan data staging yang membuat scale 2 jadi tidak cukup.'

SELECT c.relname AS tabel, a.attname AS kolom,
       format_type(a.atttypid, a.atttypmod) AS tipe
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r'
   AND format_type(a.atttypid, a.atttypmod) ~ 'numeric\(15,2\)'
   AND c.relname IN (SELECT table_name FROM information_schema.columns
                      WHERE table_schema = '_staging')
 ORDER BY 1, 2;
