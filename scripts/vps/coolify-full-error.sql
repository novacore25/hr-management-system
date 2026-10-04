-- Ambil TEKS PENUH dari entri log yang memuat pesan kegagalan.
--
-- Semua Pemeriksaan sebelumnya memangkas ke 170-190 karakter, dan
-- seperti yang terlihat di sini, bagian yang dipangkas justru
-- bagian yang berisi penyebabnya:
--
--   "Deployment failed: Command execution failed (exit code 1): ..."
--   "   | Error: #0 building with "default" insta"   <- terpotong
--
Output tidak dipangkas sama sekali di sini.

\pset pager off
\pset format unaligned
\pset tuples_only off

\echo '=== 1. TEKS PENUH entri yang menyebut "Deployment failed" ==='
SELECT q.created_at AS kapan,
       e.item->>'output' AS isi_penuh
  FROM application_deployment_queues q,
       LATERAL jsonb_array_elements(q.logs::jsonb) AS e(item)
 WHERE q.application_name LIKE '%rredcbao%'
   AND q.status = 'failed'
   AND e.item->>'output' LIKE '%Deployment failed%'
 ORDER BY q.created_at DESC
 LIMIT 1;

\echo ''
\echo '=== 2. TEKS PENUH semua entri stderr pada build terakhir, dipisah ==='
SELECT '[' || e.ordinality || '] ' || coalesce(e.item->>'output','')
  FROM application_deployment_queues q,
       LATERAL jsonb_array_elements(q.logs::jsonb) WITH ORDINALITY AS e(item, ordinality)
 WHERE q.application_name LIKE '%rredcbao%'
   AND q.status = 'failed'
   AND e.item->>'type' = 'stderr'
   AND q.created_at = (SELECT max(created_at) FROM application_deployment_queues
                        WHERE application_name LIKE '%rredcbao%' AND status='failed')
 ORDER BY e.ordinality;

\echo ''
\echo '=== 3. Hanya baris yang menyebut CANCELED, ERROR, atau FAIL ==='
SELECT '[' || e.ordinality || '] ' || coalesce(e.item->>'output','')
  FROM application_deployment_queues q,
       LATERAL jsonb_array_elements(q.logs::jsonb) WITH ORDINALITY AS e(item, ordinality)
 WHERE q.application_name LIKE '%rredcbao%'
   AND q.status = 'failed'
   AND coalesce(e.item->>'output','') ~ '(?i)CANCELED|ERROR|FAIL|error:'
   AND q.created_at = (SELECT max(created_at) FROM application_deployment_queues
                        WHERE application_name LIKE '%rredcbao%' AND status='failed')
 ORDER BY e.ordinality;
