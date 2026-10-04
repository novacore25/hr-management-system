-- Cari SEMUA kolom yang nullable di staging tapi NOT NULL di tujuan.
--
-- Yang membuat kelas ini berbahaya: tipenya sama, jadi lolos
-- pemeriksaan tipe yang sudah dilakukan sebelumnya. Yang berbeda
-- hanya apakah NULL diperbolehkan.
--
-- Kalau kolom tujuan punya DEFAULT, NULL bisa diganti default itu
-- tanpa kehilangan informasi. Kalau tidak punya DEFAULT, NULL harus
-- jadi dihapus atau kolomnya dilonggarkan -- itu keputusan lain,
-- bukan sesuatu yang bisa ditebak di sini.

\echo '=== A. Nullable di staging, NOT NULL di tujuan ==='

WITH s AS (
  SELECT table_name, column_name, is_nullable
    FROM information_schema.columns
   WHERE table_schema = '_staging'
), p AS (
  SELECT table_name, column_name, is_nullable, column_default, data_type
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name IN (SELECT table_name FROM information_schema.columns
                         WHERE table_schema = '_staging')
)
SELECT s.table_name,
       s.column_name,
       p.data_type,
       CASE WHEN p.column_default IS NULL
            THEN 'TANPA default' ELSE 'ada default' END AS syarat_default,
       p.column_default
  FROM s JOIN p USING (table_name, column_name)
 WHERE s.is_nullable = 'YES'
   AND p.is_nullable = 'NO'
 ORDER BY 1, 2;

\echo ''
\echo '=== B. Berapa baris NULL di staging untuk tiap kolom itu ==='

DO $$
DECLARE
  r record;
  jml bigint;
BEGIN
  FOR r IN
    WITH s AS (
      SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = '_staging' AND is_nullable = 'YES'
    ), p AS (
      SELECT table_name, column_name, column_default FROM information_schema.columns
       WHERE table_schema = 'public' AND is_nullable = 'NO'
         AND table_name IN (SELECT table_name FROM information_schema.columns
                             WHERE table_schema = '_staging')
    )
    SELECT s.table_name, s.column_name, p.column_default
      FROM s JOIN p USING (table_name, column_name)
     ORDER BY 1, 2
  LOOP
    EXECUTE format('SELECT count(*) FROM _staging.%I WHERE %I IS NULL',
                   r.table_name, r.column_name) INTO jml;
    RAISE NOTICE '  % . % : % baris NULL, default di tujuan = %',
      r.table_name, r.column_name, jml, coalesce(r.column_default, '(tidak ada)');
  END LOOP;
END $$;
