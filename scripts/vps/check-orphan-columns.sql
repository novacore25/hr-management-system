-- Dua kolom yang semua nilainya "tidak ada di users":
--   absensi_logs.actor          567 dari 567
--   leave_requests.processed_by 272 dari 272
--
-- Pemeriksaan integritas FK mengira keduanya kolom rujukan user.
-- Dia salah. Isinya NAMA, bukan id:
--   absensi_logs.actor   'SISTEM (Silent Sync)' 394, 'Marcella Dian Mutiara' 148
--   processed_by         'Marcella Dian Mutiara' 259, dan seterusnya
-- Dan 0 dari keduanya cocok dengan user id di _staging -- jadi memang
-- tidak pernah user id. Yang menentukan: md5 kedua kolom identik
-- antara staging dan produksi, jadi migrasi tidak mengubah apa pun.
--
-- File ini tetap berguna sebagai bukti, bukan sebagai pemeriksaan FK.

\pset pager off

\echo '=== 1. Bukti: isi kolom identik antara staging dan produksi ==='
SELECT 'absensi_logs.actor' AS kolom,
       md5((SELECT string_agg(coalesce(x, '~'), '|' ORDER BY x)
              FROM (SELECT actor AS x FROM _staging.absensi_logs) s)) AS staging,
       md5((SELECT string_agg(coalesce(x, '~'), '|' ORDER BY x)
              FROM (SELECT actor AS x FROM public.absensi_logs) s)) AS produksi
UNION ALL
SELECT 'leave_requests.processed_by',
       md5((SELECT string_agg(coalesce(x, '~'), '|' ORDER BY x)
              FROM (SELECT processed_by AS x FROM _staging.leave_requests) s)),
       md5((SELECT string_agg(coalesce(x, '~'), '|' ORDER BY x)
              FROM (SELECT processed_by AS x FROM public.leave_requests) s));

\echo ''
\echo '=== 2. Pola nilainya: ini nama, bukan id ==='
-- UNION ALL tidak boleh langsung diikuti ORDER BY ... LIMIT di level
-- yang sama; butuh dibungkus subquery lebih dulu.
SELECT * FROM (
  SELECT 'absensi_logs.actor' AS kolom, actor AS contoh, count(*) AS jumlah
    FROM _staging.absensi_logs GROUP BY 1, 2
  UNION ALL
  SELECT 'leave_requests.processed_by', processed_by, count(*)
    FROM _staging.leave_requests WHERE processed_by IS NOT NULL
   GROUP BY 1, 2
) t ORDER BY jumlah DESC LIMIT 10;

\echo ''
\echo '=== 3. users.department_id (department_id bertipe uuid di tujuan) ==='
SELECT count(*) FILTER (WHERE department_id IS NOT NULL) AS terisi,
       count(*) FILTER (WHERE department_id IS NOT NULL
                          AND NOT EXISTS (SELECT 1 FROM public.departments d
                                           WHERE d.id = u.department_id)) AS nyasar
  FROM public.users u;

\echo ''
\echo '=== 4. managed_departments: urutan asli masih utuh? ==='
SELECT u.name,
       (SELECT string_agg(d.name, ' -> ' ORDER BY e.ord)
          FROM jsonb_array_elements_text(u.managed_departments) WITH ORDINALITY AS e(uuid, ord)
          JOIN public.departments d ON d.id::text = e.uuid) AS urutan_dalam_uuid,
       (SELECT string_agg(x.nama, ' -> ' ORDER BY x.ord)
          FROM _staging.users su,
               unnest(su.managed_departments) WITH ORDINALITY AS x(nama, ord)
         WHERE su.id::text = u.id) AS urutan_asli_supabase
  FROM public.users u
 WHERE u.managed_departments IS NOT NULL AND u.managed_departments <> '[]'::jsonb
 ORDER BY u.name;
