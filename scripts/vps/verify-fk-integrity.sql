-- Cek transformasi yang paling rawan: kunci asing uuid yang jadi teks.
--
-- Audit sebelumnya menemukan 285 baris leave_requests punya
-- executive_status = 'approved' (diisi massal dari processed_by) tapi
-- hanya 8 yang punya executive_approved_by. Kalau UUID-nya jadi rusak
-- saat dipindahkan ke varchar, history itu akan tidak bisa ditampilkan
-- tanpa error -- dan tidak ada yang akan melihatnya sampai ada orang
-- yang membuka halaman itu.

\pset pager off

\echo '=== 1. leave_requests: FK executor masih nyambung ke users? ==='
SELECT count(*) AS total,
       count(*) FILTER (WHERE executive_approved_by IS NOT NULL) AS punya_exec_uuid,
       count(*) FILTER (WHERE executive_approved_by IS NOT NULL
                          AND NOT EXISTS (SELECT 1 FROM public.users u
                                           WHERE u.id = l.executive_approved_by)) AS exec_uuid_nyasar,
       count(*) FILTER (WHERE hr_approved_by IS NOT NULL
                          AND NOT EXISTS (SELECT 1 FROM public.users u
                                           WHERE u.id = l.hr_approved_by)) AS hr_uuid_nyasar
  FROM public.leave_requests l;

\echo ''
\echo '=== 2. resolved_by / processed_by juga perlu dicek ==='
SELECT count(*) FILTER (WHERE processed_by IS NOT NULL
                          AND NOT EXISTS (SELECT 1 FROM public.users u
                                           WHERE u.id = l.processed_by)) AS processed_by_nyasar,
       count(*) FILTER (WHERE processed_by IS NOT NULL) AS punya_processed_by
  FROM public.leave_requests l;

\echo ''
\echo '=== 3. FK lain yang paling banyak dipakai ==='
SELECT 'kpi_assignments.assigned_by' AS kolom,
       count(*) FILTER (WHERE assigned_by IS NOT NULL
                          AND NOT EXISTS (SELECT 1 FROM public.users u
                                           WHERE u.id = a.assigned_by)) AS nyasar,
       count(*) FILTER (WHERE assigned_by IS NOT NULL) AS terisi
  FROM public.kpi_assignments a
UNION ALL
SELECT 'kpis.created_by',
       count(*) FILTER (WHERE created_by IS NOT NULL
                          AND NOT EXISTS (SELECT 1 FROM public.users u
                                           WHERE u.id = k.created_by)),
       count(*) FILTER (WHERE created_by IS NOT NULL)
  FROM public.kpis k
UNION ALL
SELECT 'monthly_scores.inputted_by',
       count(*) FILTER (WHERE inputted_by IS NOT NULL
                          AND NOT EXISTS (SELECT 1 FROM public.users u
                                           WHERE u.id = m.inputted_by)),
       count(*) FILTER (WHERE inputted_by IS NOT NULL)
  FROM public.monthly_scores m
UNION ALL
SELECT 'overtime_requests.approved_by',
       count(*) FILTER (WHERE approved_by IS NOT NULL
                          AND NOT EXISTS (SELECT 1 FROM public.users u
                                           WHERE u.id = o.approved_by)),
       count(*) FILTER (WHERE approved_by IS NOT NULL)
  FROM public.overtime_requests o
UNION ALL
SELECT 'feedbacks.user_id',
       count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.users u
                                           WHERE u.id = f.user_id)),
       count(*)
  FROM public.feedbacks f
UNION ALL
SELECT 'absensi_logs.actor',
       count(*) FILTER (WHERE actor IS NOT NULL
                          AND NOT EXISTS (SELECT 1 FROM public.users u
                                           WHERE u.id = al.actor)),
       count(*) FILTER (WHERE actor IS NOT NULL)
  FROM public.absensi_logs al
UNION ALL
SELECT 'absensi_logs.target_user_id',
       count(*) FILTER (WHERE target_user_id IS NOT NULL
                          AND NOT EXISTS (SELECT 1 FROM public.users u
                                           WHERE u.id = al.target_user_id)),
       count(*) FILTER (WHERE target_user_id IS NOT NULL)
  FROM public.absensi_logs al
 ORDER BY 1;

\echo ''
\echo '=== 4. users.department_id masih nyambung ke departments? ==='
SELECT count(*) FILTER (WHERE department_id IS NOT NULL
                          AND NOT EXISTS (SELECT 1 FROM public.departments d
                                           WHERE d.id::text = u.department_id)) AS nyasar,
       count(*) FILTER (WHERE department_id IS NOT NULL) AS terisi
  FROM public.users u;

\echo ''
\echo '=== 5. Dua pengguna yang punya managed_departments, urutannya utuh? ==='
SELECT u.name,
       array_agg(d.name ORDER BY ord) AS divisi_dalam_urutan_asli
  FROM public.users u,
       unnest(u.managed_departments) WITH ORDINALITY AS e(uuid, ord)
  JOIN public.departments d ON d.id::text = e.uuid
 WHERE u.name IN ('Icha Fitri Ayunda', 'Safira Az Zahra')
 GROUP BY u.name
 ORDER BY u.name;
