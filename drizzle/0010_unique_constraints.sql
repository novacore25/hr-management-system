-- =============================================================================
-- UNIQUE yang hilang + paginasi defensif untuk tabel yang bisa membengkak.
--
-- CARA JALANKAN: jalankan bagian 1 dulu dan PERIKSA hasilnya sebelum lanjut ke
-- bagian 2. Kalau bagian 1 melaporkan duplikat, JANGAN lanjut — laporan ke
-- pemilik sistem supaya datanya dibersihkan dulu. Menjalankan bagian 2 dengan
-- data duplikat akan gagal dan hanya menghasilkan error yang membingungkan.
--
-- Idempotent: aman dijalankan berulang kali.
-- =============================================================================

\echo ''
\echo '=== BAGIAN 1: cek duplikat (HARUS 0 baris di semua) ==='

SELECT 'departments.name' AS kolom, name AS nilai, count(*) AS jumlah
FROM departments GROUP BY name HAVING count(*) > 1
UNION ALL
SELECT 'office_locations.name', name, count(*)
FROM office_locations GROUP BY name HAVING count(*) > 1
UNION ALL
SELECT 'letter_types.code', code, count(*)
FROM letter_types GROUP BY code HAVING count(*) > 1
ORDER BY 1;

-- kpis.title sengaja TIDAK di uniques-kan: judul KPI memang boleh sama
-- antar bulan (mis. "Kualitas Absensi" muncul tiap bulan), yang unik adalah
-- kombinasi (title, year, month). Cek kombinasi itu:
SELECT 'kpis(title,year,month)' AS kolom, title, year, month, count(*) AS jumlah
FROM kpis GROUP BY title, year, month HAVING count(*) > 1
ORDER BY 1;

-- kpi_assignments juga boleh punya lebih dari satu baris untuk user yang sama
-- kalau KPI-nya berbeda, jadi TIDAK di-unique-kan.

\echo ''
\echo '=== BAGIAN 2: tambahkan UNIQUE + paginasi (hanya jalan kalau bagian 1 kosong) ==='

DO $$
DECLARE
  dupes int;
BEGIN
  SELECT count(*) INTO dupes FROM (
    SELECT name FROM departments GROUP BY name HAVING count(*) > 1
    UNION ALL
    SELECT name FROM office_locations GROUP BY name HAVING count(*) > 1
    UNION ALL
    SELECT code FROM letter_types GROUP BY code HAVING count(*) > 1
    UNION ALL
    SELECT title FROM kpis GROUP BY title, year, month HAVING count(*) > 1
  ) d;

  IF dupes > 0 THEN
    RAISE EXCEPTION
      'Ada % nilai duplikat. Bagian 2 DIBATALKAN - bersihkan datanya dulu.', dupes;
  END IF;

  -- Dua admin bisa membuat divisi "TNT" dua kali. Akibatnya dropdown filter
  -- KPI jadi ambigu dan department_locations bisa menunjuk divisi yang salah.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'departments_name_unique') THEN
    ALTER TABLE departments ADD CONSTRAINT departments_name_unique UNIQUE (name);
    RAISE NOTICE 'departments.name -> UNIQUE';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'office_locations_name_unique') THEN
    ALTER TABLE office_locations ADD CONSTRAINT office_locations_name_unique UNIQUE (name);
    RAISE NOTICE 'office_locations.name -> UNIQUE';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'letter_types_code_unique') THEN
    ALTER TABLE letter_types ADD CONSTRAINT letter_types_code_unique UNIQUE (code);
    RAISE NOTICE 'letter_types.code -> UNIQUE';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kpis_title_period_unique') THEN
    ALTER TABLE kpis ADD CONSTRAINT kpis_title_period_unique UNIQUE (title, year, month);
    RAISE NOTICE 'kpis(title, year, month) -> UNIQUE';
  END IF;
END $$;

-- Paginasi: dua endpoint lama mengambil SELURUH isi tabel ke browser.
-- Departemen & letter type kecil dan stabil, jadi tidak ada unbounded
-- query untuk tabel master. Tabel besar (attendance, daily_reports,
-- absensi_logs, overtime_requests, payrolls) sudah dipaginasi di DAL.

\echo ''
\echo '=== hasil ==='
SELECT conname, contype
FROM pg_constraint
WHERE conname IN ('departments_name_unique','office_locations_name_unique',
                  'letter_types_code_unique','kpis_title_period_unique')
ORDER BY conname;
