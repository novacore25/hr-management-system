-- Verifikasi independen untuk migrasi 0014.
-- Dijalankan setelah migrasi, terpisah dari file migrasi itu sendiri,
-- supaya hasilnya tidak bergantung pada apa yang skrip migrasi laporkan.

\echo '=== 1. Tabel yang harusnya punya kolom baru ==='
SELECT 'users' AS tabel,
       count(*) FILTER (WHERE column_name IN
         ('address_ktp','department','emergency_contact','phone_wa',
          'status','ttl','urgent_balance','urgent_quota')) AS dari_8
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='users'
UNION ALL
SELECT 'leave_requests',
       count(*) FILTER (WHERE column_name IN
         ('deducted_urgent','executive_status','executive_approved_by',
          'executive_approved_by_name','executive_approved_at','executive_notes',
          'hr_status','hr_approved_by','hr_approved_by_name','hr_approved_at',
          'hr_notes','rejection_stage','rejection_reason','rejected_by','rejected_at'))
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='leave_requests'
UNION ALL
SELECT 'overtime_requests',
       count(*) FILTER (WHERE column_name IN
         ('first_hour_rate','first_hour_pay',
          'subsequent_hour_rate','subsequent_hour_pay'))
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='overtime_requests'
UNION ALL
SELECT 'absensi_settings',
       count(*) FILTER (WHERE column_name IN
         ('default_urgent_quota','last_urgent_reset_month'))
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='absensi_settings'
UNION ALL
SELECT 'kpis',
       count(*) FILTER (WHERE column_name IN ('category','department'))
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='kpis'
UNION ALL
SELECT 'kpi_assignments',
       count(*) FILTER (WHERE column_name IN ('notes','weight'))
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='kpi_assignments'
UNION ALL
SELECT 'kpi_settings',
       count(*) FILTER (WHERE column_name IN ('id','quantity_weight'))
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='kpi_settings'
UNION ALL
SELECT 'monthly_scores',
       count(*) FILTER (WHERE column_name = 'quality_notes')
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='monthly_scores'
UNION ALL
SELECT 'department_locations',
       count(*) FILTER (WHERE column_name = 'created_at')
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='department_locations'
ORDER BY 1;

\echo ''
\echo '=== 2. Nilai enum ==='
SELECT t.typname AS enum, string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS nilai
  FROM pg_type t
  JOIN pg_enum e ON e.enumtypid = t.oid
  JOIN pg_namespace n ON n.oid = t.typnamespace
 WHERE n.nspname='public' AND t.typname IN ('leave_type','leave_status')
 GROUP BY t.typname ORDER BY 1;

\echo ''
\echo '=== 3. Foreign key baru ==='
SELECT conname, pg_get_constraintdef(oid) AS definisi
  FROM pg_constraint
 WHERE conname IN ('leave_requests_executive_approved_by_fkey',
                   'leave_requests_hr_approved_by_fkey',
                   'kpi_settings_id_unique')
 ORDER BY conname;

\echo ''
\echo '=== 4. Tipe executive_approved_by (harus varchar, bukan uuid) ==='
SELECT table_name, column_name, data_type, character_maximum_length AS panjang
  FROM information_schema.columns
 WHERE table_name='leave_requests'
   AND column_name IN ('executive_approved_by','hr_approved_by');

\echo ''
\echo '=== 5. Constraint kpis yang salah harus SUDAH HILANG ==='
SELECT count(*) AS masih_ada
  FROM pg_constraint WHERE conname='kpis_title_period_unique';
SELECT count(*) AS index_pencarian_ada
  FROM pg_indexes WHERE indexname='kpis_title_period_lookup_idx';

\echo ''
\echo '=== 6. kpi_settings.id terisi semua? ==='
SELECT count(*) AS total, count(id) AS id_terisi,
       count(DISTINCT id) AS id_unik
  FROM kpi_settings;

\echo ''
\echo '=== 7. Data tidak boleh berubah ==='
SELECT 'users' AS t, count(*) AS n FROM users
UNION ALL SELECT 'departments', count(*) FROM departments
UNION ALL SELECT 'kpis', count(*) FROM kpis
UNION ALL SELECT 'kpi_assignments', count(*) FROM kpi_assignments
UNION ALL SELECT 'leave_requests', count(*) FROM leave_requests
UNION ALL SELECT 'kpi_settings', count(*) FROM kpi_settings
ORDER BY 1;