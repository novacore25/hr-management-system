-- Cari pesan error yang sebenarnya di dalam log build.
--
-- Yang sudah diketahui: build berhenti di langkah #11 (npm ci) dan
-- laporan Coolify hanya menyebut "exit code 1". Itu tidak berguna.
-- Yang dicari adalah baris yang benar-benar menyebut penyebabnya.

\pset pager off

\echo '=== 1. Pola kegagalan khas: npm error, OOM, TypeScript, network ==='
SELECT q.created_at AS kapan,
       left(COALESCE(e.item->>'output',''), 210) AS isi
  FROM application_deployment_queues q,
       LATERAL jsonb_array_elements(q.logs::jsonb) AS e(item)
 WHERE q.application_name LIKE '%rredcbao%'
   AND q.status = 'failed'
   AND (e.item->>'output' ~ '(?i)npm error|npm ERR!|ELIFECYCLE|ENOSPC|out of memory|oom|killed|signal 9|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|network|registry|TS\d{4}|Type error|Failed to compile|error TS|Module not found|Cannot find module')
 ORDER BY q.created_at DESC
 LIMIT 20;

\echo ''
\echo '=== 2. 12 entri PERTAMA dari build yang gagal (urutan mulai) ==='
SELECT e.ordinality AS no,
       e.item->>'type' AS tipe,
       left(COALESCE(e.item->>'output',''), 200) AS isi
  FROM application_deployment_queues q,
       LATERAL jsonb_array_elements(q.logs::jsonb) WITH ORDINALITY AS e(item, ordinality)
 WHERE q.application_name LIKE '%rredcbao%'
   AND q.status = 'failed'
   AND q.created_at = (SELECT max(created_at) FROM application_deployment_queues
                        WHERE application_name LIKE '%rredcbao%' AND status='failed')
 ORDER BY e.ordinality
 LIMIT 12;

\echo ''
\echo '=== 3. Apakah tiap kegagalan punya tanda yang sama? ==='
SELECT q.created_at AS kapan,
       count(*) FILTER (WHERE e.item->>'output' ~ '(?i)npm error|npm ERR!') AS npm_error,
       count(*) FILTER (WHERE e.item->>'output' ~ '(?i)ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|dns|resolve') AS masalah_jaringan,
       count(*) FILTER (WHERE e.item->>'output' ~ '(?i)killed|out of memory|oom') AS kehabisan_memori,
       count(*) FILTER (WHERE e.item->>'output' ~ '(?i)ENOSPC|no space left') AS kehabisan_disk,
       count(*) AS total_entri
  FROM application_deployment_queues q,
       LATERAL jsonb_array_elements(q.logs::jsonb) AS e(item)
 WHERE q.application_name LIKE '%rredcbao%'
   AND q.status = 'failed'
   AND q.created_at > now() - interval '3 days'
 GROUP BY 1
 ORDER BY 1 DESC;

\echo ''
\echo '=== 4. Bandingkan: build yang SUKSES 29 kali, sampai langkah mana? ==='
SELECT q.created_at AS kapan,
       jsonb_array_length(q.logs::jsonb) AS jumlah_entri,
       (SELECT max(x.ord) FROM jsonb_array_elements(q.logs::jsonb)
          WITH ORDINALITY AS x(item, ord)
        WHERE x.item->>'output' ~ '\[runner ' ) AS langkah_runner_terakhir
  FROM application_deployment_queues q
 WHERE q.application_name LIKE '%rredcbao%'
   AND q.status = 'finished'
   AND q.created_at > now() - interval '3 days'
 ORDER BY q.created_at DESC
 LIMIT 6;
