-- Verifikasi produksi setelah migrasi data.
--
-- Yang dibandingkan: jumlah baris, dan agregat per kolom yang
-- berubah tipe (sum/min/max/count distinct). Perbandingan jumlah
-- baris saja tidak cukup: 66 baris users bisa saja berisi 66 data
-- yang salah.
--
-- Perbandingan isi byte-per-byte tidak bisa dipakai di sini karena
-- tipe kolomnya memang berubah antara staging dan tujuan -- uuid jadi
-- varchar, text jadi enum. Yang dibandingkan adalah NILAI setelah
-- dikembalikan ke bentuk aslinya.

\echo '=== 1. Jumlah baris: staging vs produksi ==='

WITH s AS (
  SELECT 'users' AS tabel, count(*) AS n FROM _staging.users
  UNION ALL SELECT 'departments', count(*) FROM _staging.departments
  UNION ALL SELECT 'kpis', count(*) FROM _staging.kpis
  UNION ALL SELECT 'kpi_assignments', count(*) FROM _staging.kpi_assignments
  UNION ALL SELECT 'kpi_settings', count(*) FROM _staging.kpi_settings
  UNION ALL SELECT 'daily_reports', count(*) FROM _staging.daily_reports
  UNION ALL SELECT 'monthly_scores', count(*) FROM _staging.monthly_scores
  UNION ALL SELECT 'attendance', count(*) FROM _staging.attendance
  UNION ALL SELECT 'absensi_logs', count(*) FROM _staging.absensi_logs
  UNION ALL SELECT 'absensi_settings', count(*) FROM _staging.absensi_settings
  UNION ALL SELECT 'leave_requests', count(*) FROM _staging.leave_requests
  UNION ALL SELECT 'overtime_requests', count(*) FROM _staging.overtime_requests
  UNION ALL SELECT 'payrolls', count(*) FROM _staging.payrolls
  UNION ALL SELECT 'payroll_staff_settings', count(*) FROM _staging.payroll_staff_settings
  UNION ALL SELECT 'payroll_addition_types', count(*) FROM _staging.payroll_addition_types
  UNION ALL SELECT 'payroll_deduction_types', count(*) FROM _staging.payroll_deduction_types
  UNION ALL SELECT 'feedbacks', count(*) FROM _staging.feedbacks
  UNION ALL SELECT 'holidays', count(*) FROM _staging.holidays
  UNION ALL SELECT 'office_locations', count(*) FROM _staging.office_locations
  UNION ALL SELECT 'letter_types', count(*) FROM _staging.letter_types
  UNION ALL SELECT 'company_letters', count(*) FROM _staging.company_letters
  UNION ALL SELECT 'department_locations', count(*) FROM _staging.department_locations
  UNION ALL SELECT 'kpi_histories', count(*) FROM _staging.kpi_histories
), p AS (
  SELECT 'users' AS tabel, count(*) AS n FROM public.users
  UNION ALL SELECT 'departments', count(*) FROM public.departments
  UNION ALL SELECT 'kpis', count(*) FROM public.kpis
  UNION ALL SELECT 'kpi_assignments', count(*) FROM public.kpi_assignments
  UNION ALL SELECT 'kpi_settings', count(*) FROM public.kpi_settings
  UNION ALL SELECT 'daily_reports', count(*) FROM public.daily_reports
  UNION ALL SELECT 'monthly_scores', count(*) FROM public.monthly_scores
  UNION ALL SELECT 'attendance', count(*) FROM public.attendance
  UNION ALL SELECT 'absensi_logs', count(*) FROM public.absensi_logs
  UNION ALL SELECT 'absensi_settings', count(*) FROM public.absensi_settings
  UNION ALL SELECT 'leave_requests', count(*) FROM public.leave_requests
  UNION ALL SELECT 'overtime_requests', count(*) FROM public.overtime_requests
  UNION ALL SELECT 'payrolls', count(*) FROM public.payrolls
  UNION ALL SELECT 'payroll_staff_settings', count(*) FROM public.payroll_staff_settings
  UNION ALL SELECT 'payroll_addition_types', count(*) FROM public.payroll_addition_types
  UNION ALL SELECT 'payroll_deduction_types', count(*) FROM public.payroll_deduction_types
  UNION ALL SELECT 'feedbacks', count(*) FROM public.feedbacks
  UNION ALL SELECT 'holidays', count(*) FROM public.holidays
  UNION ALL SELECT 'office_locations', count(*) FROM public.office_locations
  UNION ALL SELECT 'letter_types', count(*) FROM public.letter_types
  UNION ALL SELECT 'company_letters', count(*) FROM public.company_letters
  UNION ALL SELECT 'department_locations', count(*) FROM public.department_locations
  UNION ALL SELECT 'kpi_histories', count(*) FROM public.kpi_histories
)
SELECT s.tabel, s.n AS staging, p.n AS produksi,
       CASE WHEN s.n = p.n THEN 'SAMA' ELSE 'BEDA' END AS hasil
  FROM s JOIN p USING (tabel)
 ORDER BY 1;

\echo ''
\echo '=== 2. Agregat angka (dicek ulang dari nilai yang benar-benar tersimpan) ==='

SELECT 'kpi_assignments.monthly_target' AS kolom,
       (SELECT sum(monthly_target) FROM _staging.kpi_assignments)::numeric(20,2) AS staging,
       (SELECT sum(monthly_target) FROM public.kpi_assignments)::numeric(20,2) AS produksi
UNION ALL
SELECT 'kpi_assignments.actual_total',
       (SELECT sum(actual_total) FROM _staging.kpi_assignments)::numeric(20,2),
       (SELECT sum(actual_total) FROM public.kpi_assignments)::numeric(20,2)
UNION ALL
SELECT 'kpi_assignments.achievement_max',
       (SELECT max(achievement_percentage) FROM _staging.kpi_assignments),
       (SELECT max(achievement_percentage) FROM public.kpi_assignments)
UNION ALL
SELECT 'daily_reports.value',
       (SELECT sum(value) FROM _staging.daily_reports)::numeric(20,2),
       (SELECT sum(value) FROM public.daily_reports)::numeric(20,2)
UNION ALL
SELECT 'attendance.late_fine',
       (SELECT sum(late_fine) FROM _staging.attendance),
       (SELECT sum(late_fine) FROM public.attendance)
UNION ALL
SELECT 'payrolls.base_salary',
       (SELECT sum(base_salary) FROM _staging.payrolls)::numeric(20,2),
       (SELECT sum(base_salary) FROM public.payrolls)::numeric(20,2)
UNION ALL
SELECT 'payrolls.gaji_bersih',
       (SELECT sum(base_salary + mobility_allowance + performance_bonus
                   + overtime_pay - deductions) FROM _staging.payrolls)::numeric(20,2),
       (SELECT sum(base_salary + mobility_allowance + performance_bonus
                   + overtime_pay - deductions) FROM public.payrolls)::numeric(20,2)
UNION ALL
SELECT 'payrolls.payroll_overtime_minutes',
       (SELECT sum(coalesce(payroll_overtime_minutes, 0)) FROM _staging.payrolls),
       (SELECT sum(payroll_overtime_minutes) FROM public.payrolls)
UNION ALL
SELECT 'kpis.monthly_target',
       (SELECT sum(monthly_target) FROM _staging.kpis)::numeric(20,2),
       (SELECT sum(monthly_target) FROM public.kpis)::numeric(20,2)
UNION ALL
SELECT 'monthly_scores.achievement_percentage',
       (SELECT sum(achievement_percentage) FROM _staging.monthly_scores)::numeric(20,2),
       (SELECT sum(achievement_percentage) FROM public.monthly_scores)::numeric(20,2)
UNION ALL
SELECT 'monthly_scores.actual_total',
       (SELECT sum(actual_total) FROM _staging.monthly_scores)::numeric(20,2),
       (SELECT sum(actual_total) FROM public.monthly_scores)::numeric(20,2)
UNION ALL
SELECT 'monthly_scores.bulanan',
       (SELECT count(*) FILTER (WHERE month BETWEEN 1 AND 12) FROM _staging.monthly_scores),
       (SELECT count(*) FILTER (WHERE month BETWEEN 1 AND 12) FROM public.monthly_scores)
 ORDER BY 1;

\echo ''
\echo '=== 3. Dua kolom yang dihitung ulang ==='

\echo '-- kpi_assignments.kpi_type harus sama dengan kpis.type --'
SELECT CASE WHEN a.kpi_type = k.type THEN 'SAMA' ELSE 'BEDA' END AS hasil, count(*) AS baris
  FROM public.kpi_assignments a JOIN public.kpis k ON k.id = a.kpi_id
 GROUP BY 1 ORDER BY 1;

\echo '-- users.managed_departments harus UUID yang ada di departments --'
SELECT u.name, u.managed_departments,
       CASE WHEN EXISTS (
         SELECT 1 FROM jsonb_array_elements_text(u.managed_departments) AS x(uid)
          WHERE NOT EXISTS (SELECT 1 FROM public.departments d WHERE d.id::text = x.uid)
       ) THEN 'ADA UUID ASING' ELSE 'semua UUID dikenal' END AS status
  FROM public.users u
 WHERE u.managed_departments IS NOT NULL AND u.managed_departments <> '[]'::jsonb
 ORDER BY u.name;

\echo ''
\echo '=== 4. Foreign key: ada yang menggantung? ==='

SELECT conrelid::regclass AS tabel, conname, count(*) AS baris_yatim
  FROM pg_constraint c
  JOIN LATERAL (
    SELECT 1 FROM public.kpi_assignments x
     WHERE x.kpi_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.kpis p WHERE p.id = x.kpi_id)
  ) AS y ON c.contype = 'f'
 WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace
 GROUP BY 1, 2
HAVING count(*) > 0;

SELECT 'kpi_assignments tanpa kpi valid' AS cek, count(*) AS jumlah
  FROM public.kpi_assignments a
 WHERE a.kpi_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.kpis k WHERE k.id = a.kpi_id)
UNION ALL
SELECT 'daily_reports tanpa assignment valid', count(*)
  FROM public.daily_reports d
 WHERE d.assignment_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.kpi_assignments a WHERE a.id = d.assignment_id)
UNION ALL
SELECT 'attendance tanpa user valid', count(*)
  FROM public.attendance x
 WHERE x.user_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = x.user_id)
UNION ALL
SELECT 'leave_requests tanpa user valid', count(*)
  FROM public.leave_requests l
 WHERE l.user_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = l.user_id)
UNION ALL
SELECT 'payrolls tanpa user valid', count(*)
  FROM public.payrolls p
 WHERE p.user_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p.user_id)
 ORDER BY 1;

\echo ''
\echo '=== 5. Nilai yang perlu diwaspadai (dari data Supabase, bukan bug migrasi) ==='
SELECT count(*) AS baris_pace_di_atas_100000_persen
  FROM public.kpi_assignments WHERE achievement_percentage > 100000;
SELECT count(*) AS working_days_elapsed_nol
  FROM public.kpi_assignments WHERE working_days_elapsed = 0;
