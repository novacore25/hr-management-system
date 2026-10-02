-- =============================================================================
-- Data uji untuk database LOKAL saja (hr_local_test).
--
-- TUJUAN: verify bahwa halaman benar-benar functioning — nilai yang tampil
-- benar, tombol Simpan menulis, badge jumlah cocok dengan isi tabel.
--
-- TIDAK ada data asli perusahaan di sini. Semua nama sintetis.
-- Idempotent: aman dijalankan berulang kali.
-- =============================================================================

\echo '1. Divisi tambahan untuk uji scoping Head'
INSERT INTO departments (name) VALUES ('GOWA'), ('LIMA')
ON CONFLICT DO NOTHING;

\echo '2. Kantor (+ relasi ke divisi, untuk uji geofence check-in)'
INSERT INTO office_locations (name, lat, lng, radius) VALUES
  ('Kantor Pusat TNT',  -6.241586, 106.628055, 150),
  ('Kantor Cabang GOWA', -5.147500, 119.432000, 150)
ON CONFLICT DO NOTHING;

-- Dipasangkan ke divisi pertama & kedua supaya `officesForDepartment`
-- punya data untuk diuji, bukan selalu jatuh ke "semua kantor".
DO $$
DECLARE
  d1 uuid; d2 uuid; o1 uuid; o2 uuid;
BEGIN
  SELECT id INTO d1 FROM departments ORDER BY name LIMIT 1;
  SELECT id INTO d2 FROM departments ORDER BY name DESC LIMIT 1;
  SELECT id INTO o1 FROM office_locations WHERE name = 'Kantor Pusat TNT';
  SELECT id INTO o2 FROM office_locations WHERE name = 'Kantor Cabang GOWA';

  INSERT INTO department_locations (office_location_id, department_id)
  VALUES (o1, d1), (o2, d2)
  ON CONFLICT DO NOTHING;
END $$;

\echo '3. Libur (untuk uji filter tanggal di kalender & rekap)'
INSERT INTO holidays (date, description) VALUES
  ('2026-01-01', 'Tahun Baru Masehi'),
  ('2026-08-17', 'Hari Kemerdekaan RI'),
  ('2026-12-25', 'Hari Raya Natal')
ON CONFLICT DO NOTHING;

\echo '4. Staf uji — berbagai kombinasi divisi / role / status'
-- id dipakai sebagai Auth.js user id, jadi bentuknya sama dengan yang
-- dihasilkan Auth.js (text, bukan uuid).
-- managed_departments diisi setelah VALUES (lihat blok UPDATE di bawah)
-- karena butuh subquery ke `departments`.
INSERT INTO users (id, email, name, kpi_role, absensi_role, absensi_status,
                   department_id, position, leave_quota, sick_quota,
                   is_hidden, religion, join_date, employment_status,
                   contract_end_date, phone, npwp, bank_name,
                   bank_account_number, bank_account_name)
VALUES
  ('u-hr-001','hr@novacore.test','Bunga Lestari','hr','admin','active',
   NULL,'HRD Manager',14,14,false,'Islam','2021-03-01','Tetap',
   NULL,'081200000001','12.345.678.9-001.000','BCA','1234567890','Bunga Lestari'),

  ('u-exec-001','ceo@novacore.test','Rangga Mahendra','executive','admin','active',
   NULL,'Direktur',14,14,false,'Islam','2019-01-07','Tetap',
   NULL,'081200000002',NULL,'Mandiri','9876543210','Rangga Mahendra'),

  -- Head mengelola divisi TNT. Dimas sendiri tidak punya department_id,
  -- jadi tanpa managed_departments dia tidak akan melihat apa pun —
  -- itu memang kasus tepi yang harus diuji.
  ('u-head-001','head@novacore.test','Dimas Prasetyo','head','admin','active',
   NULL,'Head of Division',14,14,false,'Kristen','2020-08-10','Tetap',
   NULL,'081200000003',NULL,'BNI','5556667770','Dimas Prasetyo'),

  ('u-dev-001','dev@novacore.test','Arif Nugroho','developer','staff','active',
   NULL,'Fullstack Developer',12,12,false,'Islam','2022-02-14','Tetap',
   NULL,'081200000004',NULL,'BRI','1112223330','Arif Nugroho'),

  ('u-staff-001','staff1@novacore.test','Rizky Ramadhan','tim','staff','active',
   (SELECT id FROM departments WHERE name='TNT'),'Frontend Developer',12,12,false,'Islam','2023-02-01','Tetap',
   NULL,'081200000005',NULL,'BCA','1111111111','Rizky Ramadhan'),

  ('u-staff-002','staff2@novacore.test','Sarah Wijaya','tim','staff','active',
   (SELECT id FROM departments WHERE name='TNT'),'Backend Developer',12,12,false,'Kristen','2023-05-15','Tetap',
   NULL,'081200000006',NULL,'BCA','2222222222','Sarah Wijaya'),

  ('u-staff-003','staff3@novacore.test','Bayu Saputra','tim','staff','active',
   (SELECT id FROM departments WHERE name='HYPE'),'QA Engineer',12,12,false,'Islam','2024-01-08','Kontrak',
   '2026-12-31','081200000007',NULL,'BRI','3333333333','Bayu Saputra'),

  -- Pendaftar baru: untuk menguji badge "pending" di halaman staf.
  ('u-pending-001','baru@novacore.test','Nadia Putri','tim','staff','pending',
   (SELECT id FROM departments WHERE name='HYPE'),'Digital Marketing',12,12,false,'Islam','2026-10-01','Probation',
   NULL,'081200000008',NULL,NULL,NULL,NULL),

  -- Akun tersembunyi: HARUS tidak muncul di mana pun (ghost mode).
  ('u-hidden-001','ghost@novacore.test','Hantu Tak Terlihat','tim','staff','active',
   (SELECT id FROM departments WHERE name='TNT'),'Test',12,12,true,'Islam','2023-01-01','Tetap',
   NULL,NULL,NULL,NULL,NULL,NULL)
ON CONFLICT (id) DO NOTHING;

-- Divisi yang dikelola Head. Ini yang jadi dasar scoping `scope=managed`
-- di /api/kpi/quality — dibaca dari SERVER, bukan dari browser.
UPDATE users
SET managed_departments = (
  SELECT jsonb_agg(d.id::text) FROM departments d WHERE d.name = 'TNT'
)
WHERE id = 'u-head-001' AND managed_departments = '[]'::jsonb;

\echo '5. Pengaturan absensi global'
INSERT INTO absensi_settings (id, work_start, work_end, max_late,
                              max_time_sick, max_time_leave, max_time_wfa,
                              office_lat, office_lng, office_radius)
VALUES (1,'08:00','18:00','08:15','12:00','23:59','12:00',
        -6.241586, 106.628055, 150)
ON CONFLICT (id) DO NOTHING;

\echo '6. Bobot KPI semua staf aktif (uji dropdown / tombol Set Bobot Global)'
INSERT INTO kpi_settings (user_id, result_weight, activity_weight, quality_weight,
                          lead_tim_weight, hr_weight)
SELECT id, 50, 30, 20, 50, 50 FROM users
WHERE absensi_status = 'active'
ON CONFLICT (user_id) DO NOTHING;

\echo '7. KPI + assignment untuk HR & Head (uji /dashboard/*/quality)'
-- Tipe `result` dan `activity` ditambahkan supaya /dashboard/tim/history
-- dan /dashboard/hr/kpi punya data yang bisa diuji — kedua halaman itu
-- butuh KPI bertipe result untuk laporan harian, dan seed sebelumnya
-- hanya punya quality/lead_tim/hr.
INSERT INTO kpis (title, description, type, unit, period, status, department_id,
                  created_by, monthly_target, year, month, brand)
VALUES
  ('Penyelesaian Tugas', 'Jumlah tugas yang diselesaikan tepat waktu.',
   'result','number','monthly','active', NULL,
   'u-hr-001', 40, 2026, 10, 'Umum'),

  ('Aktivitas Harian', 'Jumlah aktivitas tercatat setiap hari kerja.',
   'activity','number','monthly','active', NULL,
   'u-hr-001', 22, 2026, 10, NULL),

  ('Kualitas Absensi', 'Ketepatan kehadiran dan kepatuhan presensi.',
   'quality','percentage','monthly','active', NULL,
   'u-hr-001', 90, 2026, 10, 'Umum'),

  ('Kualitas Knowledge Sharing', 'PENGAIRADAN pengetahuan antar tim.',
   'quality','percentage','monthly','active', NULL,
   'u-hr-001', 85, 2026, 10, 'TNT'),

  -- Tipe lead_tim: halaman /dashboard/head/quality menampilkannya di daftar
  -- yang sama dengan quality. Hanya menyaring `quality` membuatnya hilang.
  ('Kepemimpinan Tim', 'Kapasitas memimpin dan mengarahkan tim.',
   'lead_tim','percentage','monthly','active', NULL,
   'u-hr-001', 80, 2026, 10, NULL),

  -- Tipe hr: hanya muncul di halaman Evaluasi HR.
  ('Inisiatif & Kolaborasi', 'Perilaku kerja yang melampaui target.',
   'hr','percentage','monthly','active', NULL,
   'u-hr-001', 75, 2026, 10, NULL)
ON CONFLICT DO NOTHING;

-- Assignment untuk beberapa staf supaya form input punya >1 baris.
-- u-staff-003 ada di divisi HYPE — sengaja TIDAK dikelola u-head-001,
-- jadi bisa dipakai menguji apakah scoping Head benar-benar bekerja.
-- CATATAN: kpi_assignments TIDAK punya kolom `weight`. Halaman lama
-- membaca `row.weight ?? 0` — itu kolom yang tidak pernah ada, jadi
-- nilainya selalu 0 tanpa error. Kolom yang sebenarnya adalah
-- `performance_category` dan `quality_notes`.
INSERT INTO kpi_assignments (kpi_id, kpi_type, user_id, department_id,
                             monthly_target, actual_total, achievement_percentage,
                             performance_category, quality_notes,
                             working_days_total, working_days_remaining,
                             status, assigned_by, year, month)
SELECT k.id, k.type, u.id, u.department_id, k.monthly_target, 0, 0,
       'critical', '', wd.hari, wd.hari,
       'active', 'u-hr-001', 2026, 10
FROM kpis k, users u
CROSS JOIN (SELECT 22 AS hari) wd
WHERE k.type IN ('result','activity','quality','lead_tim','hr')
  AND u.absensi_status = 'active'
  AND u.id IN ('u-hr-001','u-head-001','u-staff-001','u-staff-002','u-staff-003')
ON CONFLICT DO NOTHING;

\echo '7b. Laporan harian + koreksi nilai (uji /dashboard/tim/history)'
-- 3 hari kerja di Oktober 2026 untuk dua staf, supaya Riwayat Input dan
-- dashboard KPI punya angka — bukan kosong.
INSERT INTO daily_reports (assignment_id, kpi_id, user_id, date, value, notes)
SELECT ka.id, ka.kpi_id, ka.user_id,
       d.tanggal,
       d.nilai,
       d.catatan
FROM kpi_assignments ka
CROSS JOIN LATERAL (
  VALUES
    (DATE '2026-10-05', 3, 'Tiga tugas selesai'),
    (DATE '2026-10-06', 2, NULL),
    (DATE '2026-10-07', 4, 'Tugas klien selesai lebih awal')
) AS d(tanggal, nilai, catatan)
WHERE ka.kpi_type = 'result'
  AND ka.status = 'active'
  AND ka.year = 2026
  AND ka.month = 10
  AND ka.user_id IN ('u-staff-001', 'u-staff-002')
  AND extract(isodow FROM d.tanggal) < 6
ON CONFLICT (assignment_id, date) DO NOTHING;

-- Total assignment harus sama dengan SUM laporan, dan `working_days_elapsed`
-- harus terisi. Dulu keduanya nol: tidak ada kode yang pernah mengisi
-- kolom itu, sehingga achievementPercentage untuk KPI result/activity
-- selalu 0.
UPDATE kpi_assignments ka
SET actual_total = agg.total,
    expected_total = round(
      (ka.monthly_target / NULLIF(ka.working_days_total, 0)) * 22, 2),
    achievement_percentage = round(
      (agg.total / NULLIF(
         (ka.monthly_target / NULLIF(ka.working_days_total, 0)) * 22, 0)) * 100, 2),
    working_days_elapsed = 22,
    working_days_remaining = 0
FROM (
  SELECT assignment_id, sum(value) AS total
  FROM daily_reports GROUP BY assignment_id
) AS agg
WHERE ka.id = agg.assignment_id;

\echo '8. Absensi 3 hari terakhir (uji dashboard admin + widget check-in)'
INSERT INTO attendance (user_id, date, check_in, check_out, status, type,
                        location_status, late_fine, late_reason,
                        late_reason_status, radius_penalty, notes)
SELECT u.id, d::date, ('08:0' || x)::time, ('17:0' || x)::time,
       CASE WHEN x = 3 THEN 'late'::attendance_status ELSE 'on_time'::attendance_status END,
       'WFO', 'Dalam Area',
       CASE WHEN x = 3 THEN 25 ELSE 0 END,
       CASE WHEN x = 3 THEN 'Macet parah di jalan' ELSE '' END,
       CASE WHEN x = 3 THEN 'pending'::late_reason_status ELSE NULL END,
       0, NULL
FROM users u
CROSS JOIN generate_series(1, 3) AS g(x)
CROSS JOIN LATERAL (
  SELECT (CURRENT_DATE - x)::date AS d
) dd
WHERE u.absensi_status = 'active'
ON CONFLICT (user_id, date) DO NOTHING;

\echo '9. Pengajuan cuti approved + pending (uji /absensi/requests, approvals, rekap)'
INSERT INTO leave_requests (user_id, type, dates, reason, status,
                            processed_by, processed_at, deducted_leave, deducted_sick)
VALUES
  ('u-staff-002','leave', ARRAY[(CURRENT_DATE - 2)::date]::text[],
   'Keperluan keluarga','approved','u-hr-001', now(), 1, 0),
  ('u-staff-003','sick', ARRAY[(CURRENT_DATE - 1)::date]::text[],
   'Demam','approved','u-hr-001', now(), 0, 1),
  ('u-staff-001','wfa', ARRAY[(CURRENT_DATE + 3)::date]::text[],
   'Urusan keluarga di luar kota','pending', NULL, NULL, 0, 0)
ON CONFLICT DO NOTHING;

\echo '10. Surat resmi (uji /absensi/admin/letters + penomoran)'
INSERT INTO company_letters (company, letter_type_id, running_number, month, year,
                             full_number, issued_to, created_at)
SELECT 'TNT', lt.id, 1, 'X', 2026, '001/' || lt.code || '/HR-TNT/X/2026',
       'u-staff-001', now()
FROM letter_types lt WHERE lt.code = 'PKL'
ON CONFLICT DO NOTHING;

\echo '11. Overtime (uji /absensi/admin/overtime setelah Fase 4c)'
-- Kolom overtime_requests mengikuti nama yang di schema Drizzle, bukan
-- nama Supabase. Ada `overtime_date` (bukan `date`), `requested_*`
-- (bukan `start_time`/`end_time`), dan `tasks` jsonb untuk daftar tugas.
INSERT INTO overtime_requests (user_id, request_date, overtime_date,
                               requested_start_time, requested_end_time,
                               requested_duration_minutes, tasks, staff_notes,
                               status, created_at, updated_at)
VALUES
  ('u-staff-001', CURRENT_DATE - 2, CURRENT_DATE - 1, '18:30', '21:00',
   150, '["Rilis hotfix"]'::jsonb, 'Deadline release', 'pending', now(), now()),
  ('u-staff-003', CURRENT_DATE - 5, CURRENT_DATE - 4, '19:00', '22:30',
   210, '["Bug produksi"]'::jsonb, 'Perbaiki bug kritis', 'pending', now(), now())
ON CONFLICT DO NOTHING;

\echo '12. Log audit (uji /absensi/admin/logs)'
INSERT INTO absensi_logs (actor, action, details, created_at) VALUES
  ('u-hr-001','attendance_corrected','Koreksi check-in Rizky Ramadhan', now() - interval '2 hours'),
  ('u-exec-001','leave_approved','Setujui cuti Sarah Wijaya', now() - interval '5 hours'),
  ('SYSTEM','settings_updated','Perubahan jam kerja', now() - interval '1 day');

\echo ''
\echo '=== RINGKASAN DATA UJI ==='
SELECT 'departments' t, count(*) n FROM departments
UNION ALL SELECT 'office_locations', count(*) FROM office_locations
UNION ALL SELECT 'department_locations', count(*) FROM department_locations
UNION ALL SELECT 'users', count(*) FROM users
UNION ALL SELECT 'attendance', count(*) FROM attendance
UNION ALL SELECT 'leave_requests', count(*) FROM leave_requests
UNION ALL SELECT 'kpis', count(*) FROM kpis
UNION ALL SELECT 'kpi_assignments', count(*) FROM kpi_assignments
UNION ALL SELECT 'kpi_settings', count(*) FROM kpi_settings
UNION ALL SELECT 'company_letters', count(*) FROM company_letters
UNION ALL SELECT 'overtime_requests', count(*) FROM overtime_requests
UNION ALL SELECT 'absensi_logs', count(*) FROM absensi_logs
UNION ALL SELECT 'holidays', count(*) FROM holidays
ORDER BY 1;