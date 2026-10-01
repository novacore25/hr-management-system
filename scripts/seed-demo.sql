-- ============================================================================
-- DATA UJI / DEMO
--
-- Tujuan: mengisi database dengan data contoh supaya dashboard bisa
-- dicoba tanpa harus migrasi dari Supabase dulu.
--
-- PENTING:
--   - Hanya untuk lingkungan uji. Jangan pakai data ini di produksi.
--   - Aman dijalankan berulang (menggunakan ON CONFLICT / NOT EXISTS).
--
-- Jalankan:
--   docker exec -i vlu8rdt1abda7g69vbiwsk4p psql -U postgres -d db_hr_system \
--     < /root/hr-migration/seed_demo.sql
-- ============================================================================

BEGIN;

-- -- 1. Divisi ---------------------------------------------------------
INSERT INTO departments (name) VALUES ('TNT'), ('HYPE'), ('NOVA')
ON CONFLICT DO NOTHING;

-- -- 2. Setting absensi -------------------------------------------------
INSERT INTO absensi_settings (
  id, work_start, work_end, max_late,
  office_lat, office_lng, office_radius
) VALUES (
  1, '08:00', '18:00', '08:15',
  -6.241586, 106.628055, 100
) ON CONFLICT (id) DO NOTHING;

-- -- 3. Kantor ----------------------------------------------------------
INSERT INTO office_locations (name, lat, lng, radius)
SELECT 'Kantor Pusat', -6.241586, 106.628055, 100
WHERE NOT EXISTS (SELECT 1 FROM office_locations WHERE name = 'Kantor Pusat');

INSERT INTO department_locations (department_id, office_location_id)
SELECT d.id, o.id
FROM departments d, office_locations o
WHERE o.name = 'Kantor Pusat'
  AND NOT EXISTS (
    SELECT 1 FROM department_locations dl WHERE dl.department_id = d.id
  );

-- -- 4. Hari libur contoh ----------------------------------------------
INSERT INTO holidays (date, description) VALUES
  ('2026-01-01', 'Tahun Baru Masehi'),
  ('2026-08-17', 'Hari Kemerdekaan RI')
ON CONFLICT (date) DO NOTHING;

-- -- 5. User demo -------------------------------------------------------
-- CATATAN: kolom users.id bertipe varchar (bukan uuid) karena Auth.js
-- memakai string id. Akun demo ini tidak bisa login (tidak punya
-- akun Google), tapi datanya dipakai supaya dashboard Head/HR/
-- Executive tidak kosong.
INSERT INTO users (
  id, email, name, kpi_role, absensi_role, absensi_status,
  department_id, position, leave_quota, sick_quota
)
SELECT
  'demo-' || lower(t.nama),
  lower(t.nama) || '@demo.novacore.local',
  t.nama,
  t.kpi_role,
  'staff',
  'active',
  (SELECT id FROM departments WHERE name = t.dept),
  t.posisi,
  12,
  14
FROM (VALUES
  ('Andi',  'tim',  'TNT',  'Staf Operasional'),
  ('Budi',  'tim',  'TNT',  'Staf Operasional'),
  ('Citra', 'tim',  'HYPE', 'Staf Kreatif'),
  ('Dewi',  'head', 'HYPE', 'Kepala Divisi'),
  ('Eko',   'tim',  'NOVA', 'Staf Produksi'),
  ('Fitri', 'hr',   'NOVA', 'HR Staff')
) AS t(nama, kpi_role, dept, posisi)
WHERE NOT EXISTS (
  SELECT 1 FROM users u
  WHERE u.email = lower(t.nama) || '@demo.novacore.local'
);

-- -- 6. Bobot skor per user demo ----------------------------------------
INSERT INTO kpi_settings (
  user_id, result_weight, activity_weight, quality_weight,
  lead_tim_weight, hr_weight
)
SELECT id, 50, 30, 20, 50, 50 FROM users
WHERE id LIKE 'demo-%'
ON CONFLICT (user_id) DO NOTHING;

-- -- 7. KPI + assignment bulan berjalan ---------------------------------
DO $$
DECLARE
  v_year  int := EXTRACT(YEAR  FROM CURRENT_DATE)::int;
  v_month int := EXTRACT(MONTH FROM CURRENT_DATE)::int;
BEGIN
  INSERT INTO kpis (
    title, description, type, unit, period, monthly_target,
    year, month, status, department_id, created_by
  )
  SELECT
    v.title,
    v.descr,
    v.ktype::kpi_type,
    v.kunit::kpi_unit,
    v.kperiod::kpi_period,
    v.target,
    v_year,
    v_month,
    'active'::text,
    (SELECT id FROM departments WHERE name = v.dept_name),
    NULL
  FROM (VALUES
    ('Unit Terjual',      'Jumlah unit yang terjual',           'result',   'number',    'monthly', 100::numeric,    'TNT'),
    ('Omzet Harian',      'Nilai penjualan per hari',          'result',   'currency',  'monthly', 50000000::numeric, 'TNT'),
    ('Tingkat Kehadiran', 'Persentase hadir tepat waktu',       'quality',  'percentage','monthly', 95::numeric,    'TNT'),
    ('Konten Terbit',     'Jumlah konten yang dipublikasikan', 'activity', 'number',    'monthly', 60::numeric,    'HYPE'),
    ('Engagement Rate',   'Rata-rata interaksi audiens',       'quality',  'percentage','monthly', 5::numeric,     'HYPE')
  ) AS v(title, descr, ktype, kunit, kperiod, target, dept_name)
  WHERE NOT EXISTS (
    SELECT 1 FROM kpis
    WHERE kpis.title = v.title AND kpis.year = v_year AND kpis.month = v_month
  );

  INSERT INTO kpi_assignments (
    kpi_id, kpi_type, user_id, department_id,
    monthly_target, actual_total, expected_total, achievement_percentage,
    current_daily_target, working_days_total, working_days_elapsed,
    working_days_remaining, active_days, status, performance_category,
    year, month
  )
  SELECT
    k.id,
    k.type,
    u.id,
    u.department_id,
    k.monthly_target,
    0, 0, 0,
    k.monthly_target / 20,
    20, 5, 15, 5,
    'active'::assignment_status,
    'warning'::performance_category,
    v_year,
    v_month
  FROM kpis k
  JOIN users u ON u.id LIKE 'demo-%'
  WHERE k.year = v_year AND k.month = v_month
    AND NOT EXISTS (
      SELECT 1 FROM kpi_assignments a
      WHERE a.kpi_id = k.id
        AND a.user_id = u.id
        AND a.year = v_year
        AND a.month = v_month
    );
END $$;

-- -- 8. Laporan harian 10 hari terakhir ---------------------------------
INSERT INTO daily_reports (
  assignment_id, kpi_id, user_id, date, value, created_at, updated_at
)
SELECT
  a.id, a.kpi_id, a.user_id,
  (CURRENT_DATE - (n || ' days')::interval)::date,
  ROUND((10 + RAND() * 8)::numeric, 2),
  now(), now()
FROM kpi_assignments a
CROSS JOIN generate_series(1, 10) AS n
WHERE a.status = 'active'
  AND a.kpi_type IN ('result', 'activity')
  AND NOT EXISTS (
    SELECT 1 FROM daily_reports d
    WHERE d.assignment_id = a.id
      AND d.date = (CURRENT_DATE - (n || ' days')::interval)::date
  );

-- -- 9. Hitung ulang total assignment (pengganti trigger PostgreSQL) ----
UPDATE kpi_assignments a
SET
  actual_total = COALESCE(s.total, 0),
  achievement_percentage = CASE
    WHEN a.monthly_target > 0
    THEN ROUND((COALESCE(s.total, 0) / a.monthly_target) * 100, 2)
    ELSE 0
  END,
  updated_at = now()
FROM (
  SELECT assignment_id, SUM(value) AS total
  FROM daily_reports
  GROUP BY assignment_id
) s
WHERE a.id = s.assignment_id;

COMMIT;

-- -- Ringkasan ----------------------------------------------------------
SELECT 'departments' AS tabel, count(*) AS jumlah FROM departments
UNION ALL SELECT 'users',            count(*) FROM users
UNION ALL SELECT 'kpis',             count(*) FROM kpis
UNION ALL SELECT 'kpi_assignments',  count(*) FROM kpi_assignments
UNION ALL SELECT 'daily_reports',    count(*) FROM daily_reports
UNION ALL SELECT 'office_locations', count(*) FROM office_locations
UNION ALL SELECT 'holidays',         count(*) FROM holidays
UNION ALL SELECT 'kpi_settings',     count(*) FROM kpi_settings;