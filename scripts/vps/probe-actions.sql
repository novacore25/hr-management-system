-- Dua fakta yang harus benar sebelum deployment dianggap selesai.
--
-- 1. Nama action di audit log. Kalau tabellenya punya CHECK constraint
--    atau enum untuk `action`, maka action baru
--    'leave_approved_hr_by_executive_fallback' akan GAGAL saat INSERT
--    -- bukan saat compile, bukan saat build, tapi saat seseorang
--    -- benar-benar menutup pengajuan dalam mode cadangan. Itu kegagalan
--    -- paling lambat dan paling sulit ditebak.
--
-- 2. Baris di absensi_logs yang sudah memakai action lama. Menippet ini
--    memberi tahu apakah sistem lama memang sudah mencatat bottleneck
--    per tahap -- yang berarti penamaan punya preseden yang perlu
--    diikuti, bukan diperbaiki diam-diam.

\pset pager off

\echo '=== 1. Apakah kolom action punya batasan? ==='
SELECT column_name,
       data_type,
       udt_name
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'absensi_logs'
   AND column_name = 'action';

\echo ''
\echo '  Kalau udt_name = '"'"'varchar'"'"' atau '"'"'text'"'"', berarti bebas.'
\echo '  Kalau udt_name = '"'"'enum_...'"'"' atau '"'"'leave_status'"'"', berarti ADA BATASAN.'

\echo ''
\echo '=== 2. Constraint di tabel absensi_logs ==='
SELECT conname, pg_get_constraintdef(oid) AS definisi
  FROM pg_constraint
 WHERE conrelid = 'public.absensi_logs'::regclass
 ORDER BY conname;

\echo ''
\echo '=== 3. Semua action yang sudah pernah dipakai ==='
SELECT action, count(*) AS jumlah, max(created_at)::date AS terakhir
  FROM public.absensi_logs
 GROUP BY action
 ORDER BY max(created_at) DESC;

\echo ''
\echo '=== 4. Apakah ada preseden penamaan per tahap? ==='
\echo '  Kalau ada action seperti hr_approve_leave dan'
\echo '  executive_approve_leave, maka penamaan punya konvensi yang'
\echo '  harus diikuti -- dan action baru harus mengikuti konvensi itu.'

\echo ''
\echo '=== 5. Cek langsung: action fallback bisa di-insert? ==='
\echo '  Dicoba di dalam transaksi yang di-ROLLBACK, jadi tidak ada'
\echo '  jejak tersisa kalau ada batasan yang menolak.'
BEGIN;
INSERT INTO public.absensi_logs (actor, action, details, created_at)
VALUES ('uji', 'leave_approved_hr_by_executive_fallback', 'cek batasan', now());
\echo '  INSERT fallback: BERHASIL -- tidak ada batasan pada kolom action'
ROLLBACK;

\echo ''
\echo '=== 6. Action fallback belum pernah dipakai di produksi ==='
\echo '  (diharapkan 0 -- fitur ini baru di-deploy)'
SELECT count(*) AS dipakai FROM public.absensi_logs
 WHERE action = 'leave_approved_hr_by_executive_fallback';