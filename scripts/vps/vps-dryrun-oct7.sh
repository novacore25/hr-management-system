#!/bin/sh
set -eu

DB=vlu8rdt1abda7g69vbiwsk4p
LOCAL=db_hr_system
ASLI=/root/migrations/0018_delta_migration_oct7.sql
UJI=/tmp/0018-dryrun.sql

echo "=== 1. Buat berkas simulasi dry-run (COMMIT diganti periksa + ROLLBACK) ==="
sed '$d' "$ASLI" > "$UJI"

cat << 'CHECK_SQL' >> "$UJI"

-- ============ PEMERIKSAAN DI DALAM TRANSAKSI ============
WITH staging AS (
  SELECT 'departments' AS tabel, count(*)::bigint AS baris FROM _staging.departments
  UNION ALL SELECT 'office_locations', count(*)::bigint FROM _staging.office_locations
  UNION ALL SELECT 'letter_types', count(*)::bigint FROM _staging.letter_types
  UNION ALL SELECT 'users', count(*)::bigint FROM _staging.users
  UNION ALL SELECT 'absensi_settings', count(*)::bigint FROM _staging.absensi_settings
  UNION ALL SELECT 'holidays', count(*)::bigint FROM _staging.holidays
  UNION ALL SELECT 'kpis', count(*)::bigint FROM _staging.kpis
  UNION ALL SELECT 'kpi_assignments', count(*)::bigint FROM _staging.kpi_assignments
  UNION ALL SELECT 'kpi_settings', count(*)::bigint FROM _staging.kpi_settings
  UNION ALL SELECT 'kpi_histories', count(*)::bigint FROM _staging.kpi_histories
  UNION ALL SELECT 'daily_reports', count(*)::bigint FROM _staging.daily_reports
  UNION ALL SELECT 'monthly_scores', count(*)::bigint FROM _staging.monthly_scores
  UNION ALL SELECT 'attendance', count(*)::bigint FROM _staging.attendance
  UNION ALL SELECT 'leave_requests', count(*)::bigint FROM _staging.leave_requests
  UNION ALL SELECT 'overtime_requests', count(*)::bigint FROM _staging.overtime_requests
  UNION ALL SELECT 'payroll_addition_types', count(*)::bigint FROM _staging.payroll_addition_types
  UNION ALL SELECT 'payroll_deduction_types', count(*)::bigint FROM _staging.payroll_deduction_types
  UNION ALL SELECT 'payroll_staff_settings', count(*)::bigint FROM _staging.payroll_staff_settings
  UNION ALL SELECT 'payrolls', count(*)::bigint FROM _staging.payrolls
  UNION ALL SELECT 'feedbacks', count(*)::bigint FROM _staging.feedbacks
  UNION ALL SELECT 'absensi_logs', count(*)::bigint FROM _staging.absensi_logs
  UNION ALL SELECT 'company_letters', count(*)::bigint FROM _staging.company_letters
  UNION ALL SELECT 'department_locations', count(*)::bigint FROM _staging.department_locations
),
tujuan AS (
  SELECT 'departments' AS tabel, count(*)::bigint AS baris FROM public.departments
  UNION ALL SELECT 'office_locations', count(*)::bigint FROM public.office_locations
  UNION ALL SELECT 'letter_types', count(*)::bigint FROM public.letter_types
  UNION ALL SELECT 'users', (count(*) - (SELECT count(*) FROM users_backup))::bigint FROM public.users
  UNION ALL SELECT 'absensi_settings', count(*)::bigint FROM public.absensi_settings
  UNION ALL SELECT 'holidays', count(*)::bigint FROM public.holidays
  UNION ALL SELECT 'kpis', count(*)::bigint FROM public.kpis
  UNION ALL SELECT 'kpi_assignments', count(*)::bigint FROM public.kpi_assignments
  UNION ALL SELECT 'kpi_settings', count(*)::bigint FROM public.kpi_settings
  UNION ALL SELECT 'kpi_histories', count(*)::bigint FROM public.kpi_histories
  UNION ALL SELECT 'daily_reports', count(*)::bigint FROM public.daily_reports
  UNION ALL SELECT 'monthly_scores', count(*)::bigint FROM public.monthly_scores
  UNION ALL SELECT 'attendance', count(*)::bigint FROM public.attendance
  UNION ALL SELECT 'leave_requests', count(*)::bigint FROM public.leave_requests
  UNION ALL SELECT 'overtime_requests', count(*)::bigint FROM public.overtime_requests
  UNION ALL SELECT 'payroll_addition_types', count(*)::bigint FROM public.payroll_addition_types
  UNION ALL SELECT 'payroll_deduction_types', count(*)::bigint FROM public.payroll_deduction_types
  UNION ALL SELECT 'payroll_staff_settings', count(*)::bigint FROM public.payroll_staff_settings
  UNION ALL SELECT 'payrolls', count(*)::bigint FROM public.payrolls
  UNION ALL SELECT 'feedbacks', count(*)::bigint FROM public.feedbacks
  UNION ALL SELECT 'absensi_logs', count(*)::bigint FROM public.absensi_logs
  UNION ALL SELECT 'company_letters', count(*)::bigint FROM public.company_letters
  UNION ALL SELECT 'department_locations', count(*)::bigint FROM public.department_locations
)
SELECT s.tabel,
       s.baris AS baris_staging,
       d.baris AS baris_tujuan,
       CASE WHEN s.baris = d.baris THEN 'SAMA' ELSE 'BEDA' END AS hasil
  FROM staging s FULL JOIN tujuan d USING (tabel)
 ORDER BY 1;

-- Cek akun OAuth yang berhasil dipulihkan
SELECT 'accounts' AS tabel, count(*) AS total_accounts FROM public.accounts;

-- Cek user test vps
SELECT 'test_user_vps' AS status, email, name FROM public.users WHERE email = 'web.tntmedia@gmail.com';

-- Cek managed_departments sample
SELECT name, managed_departments FROM public.users
 WHERE managed_departments IS NOT NULL AND managed_departments <> '[]'::jsonb
 ORDER BY name LIMIT 5;

-- Cek absensi hari ini (7 Okt 2026)
SELECT 'attendance_today' AS info, count(*) AS baris_hari_ini
  FROM public.attendance WHERE date = '2026-10-07';

ROLLBACK;
CHECK_SQL

echo "=== 2. Jalankan simulasi di dalam transaksi (ROLLBACK) ==="
docker exec -i "$DB" psql -U postgres -d "$LOCAL" -v ON_ERROR_STOP=1 < "$UJI" > /tmp/dryrun.out 2>&1
cat /tmp/dryrun.out

echo ""
echo "=== 3. Cek apakah rollback bekerja (data public harus tetap pada snapshot sebelum dry-run) ==="
docker exec "$DB" psql -U postgres -d "$LOCAL" -c "
  SELECT 'attendance' AS tabel, max(date)::text AS max_tanggal FROM public.attendance
  UNION ALL
  SELECT 'accounts', count(*)::text FROM public.accounts;
"
