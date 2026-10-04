-- Ambil alasan gagalnya dari log deployment.
--
-- Kolom `logs` berisi larik JSON dalam SATU baris panjang, jadi
-- `tail -45` hanya mengambil satu baris danamped正规正规的吗
-- tidak pernah sampai ke ujung log. Harus dipecah per elemen.
--
-- Yang dicari: entri bertipe stderr, atau yang menyebut error.

\pset pager off

\echo '=== 1. 30 entri log terakhir dari deployment yang gagal ==='
SELECT e.ordinality AS no,
       e.item->>'timestamp' AS waktu,
       e.item->>'type' AS tipe,
       left(COALESCE(e.item->>'output',''), 170) AS isi
  FROM application_deployment_queues q,
       LATERAL jsonb_array_elements(q.logs::jsonb) WITH ORDINALITY AS e(item, ordinality)
 WHERE q.application_name LIKE '%rredcbao%'
   AND q.status = 'failed'
   AND q.created_at = (SELECT max(created_at) FROM application_deployment_queues
                        WHERE application_name LIKE '%rredcbao%' AND status='failed')
 ORDER BY e.ordinality DESC
 LIMIT 30;

\echo ''
\echo '=== 2. Semua entri stderr dari 6 deployment yang gagal ==='
SELECT q.created_at AS kapan,
       left(COALESCE(e.item->>'output',''), 200) AS isi
  FROM application_deployment_queues q,
       LATERAL jsonb_array_elements(q.logs::jsonb) AS e(item)
 WHERE q.application_name LIKE '%rredcbao%'
   AND q.status = 'failed'
   AND (e.item->>'type' = 'stderr'
        OR e.item->>'output' ~* '(?i)error|denied|unauthorized|cannot|unable|exit code|no such|failed to')
 ORDER BY q.created_at DESC, e.item->>'timestamp'
 LIMIT 25;

\echo ''
\echo '=== 3. Seberapa dalam log itu? Berapa entri tiap deployment? ==='
SELECT created_at AS kapan,
       status,
       jsonb_array_length(logs::jsonb) AS jumlah_entri,
       (SELECT count(*) FROM jsonb_array_elements(logs::jsonb) x(item)
         WHERE x.item->>'type' = 'stderr') AS entri_stderr
  FROM application_deployment_queues
 WHERE application_name LIKE '%rredcbao%'
   AND created_at > now() - interval '3 days'
 ORDER BY created_at DESC
 LIMIT 10;
