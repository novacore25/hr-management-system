#!/bin/sh
# Petakan kolom staging ke tabel tujuan, dan tunjukkan di mana tipe
# keduanya beda.
#
# Transformasi di tahap berikutnya harus ditulis per kolom, jadi daftar
# ini perlu lengkap dan akurat -- kalau ada kolom yang terlewat, data
# di kolom itu hilang tanpa ada yang melihatnya.
set -u
DB=vlu8rdt1abda7g69vbiwsk4p
LOCAL=db_hr_system

SQL="
WITH s AS (
  SELECT table_name, column_name, data_type, ordinal_position
    FROM information_schema.columns WHERE table_schema='_staging'
), p AS (
  SELECT table_name, column_name, data_type, ordinal_position
    FROM information_schema.columns WHERE table_schema='public'
     AND table_name IN (SELECT table_name FROM s)
)
SELECT coalesce(s.table_name, p.table_name) AS tabel,
       coalesce(s.column_name, p.column_name) AS kolom,
       coalesce(s.data_type, '-') AS tipe_staging,
       coalesce(p.data_type, '-') AS tipe_tujuan,
       CASE WHEN s.column_name IS NULL THEN 'HANYA DI TUJUAN'
            WHEN p.column_name IS NULL THEN 'HANYA DI STAGING'
            WHEN s.data_type <> p.data_type THEN 'TIPE BEDA'
            ELSE 'sama' END AS status
  FROM s FULL JOIN p USING (table_name, column_name)
 ORDER BY 1, coalesce(s.ordinal_position, p.ordinal_position, 999);"

echo "=== 1. Ringkasan per tabel ==="
docker exec "$DB" psql -U postgres -d "$LOCAL" -c "
WITH s AS (
  SELECT table_name, column_name, data_type FROM information_schema.columns
   WHERE table_schema='_staging'
), p AS (
  SELECT table_name, column_name, data_type FROM information_schema.columns
   WHERE table_schema='public' AND table_name IN (SELECT table_name FROM s)
)
SELECT coalesce(s.table_name,p.table_name) AS tabel,
       count(*) FILTER (WHERE s.column_name IS NOT NULL AND p.column_name IS NOT NULL) AS sama,
       count(*) FILTER (WHERE s.column_name IS NOT NULL AND p.column_name IS NULL) AS staging_saja,
       count(*) FILTER (WHERE s.column_name IS NULL AND p.column_name IS NOT NULL) AS tujuan_saja,
       count(*) FILTER (WHERE s.data_type IS NOT NULL AND p.data_type IS NOT NULL
                          AND s.data_type <> p.data_type) AS tipe_beda
  FROM s FULL JOIN p USING (table_name, column_name)
 GROUP BY 1 ORDER BY 1;" 2>&1

echo ""
echo "=== 2. Kolom TIPE BEDA (butuh transformasi) ==="
docker exec "$DB" psql -U postgres -d "$LOCAL" -c "
WITH s AS (
  SELECT table_name, column_name, data_type, udt_name FROM information_schema.columns
   WHERE table_schema='_staging'
), p AS (
  SELECT table_name, column_name, data_type, udt_name FROM information_schema.columns
   WHERE table_schema='public' AND table_name IN (SELECT table_name FROM s)
)
SELECT s.table_name AS tabel, s.column_name AS kolom,
       s.data_type || ' (' || s.udt_name || ')' AS dari_staging,
       p.data_type || ' (' || p.udt_name || ')' AS ke_tujuan
  FROM s JOIN p USING (table_name, column_name)
 WHERE s.udt_name <> p.udt_name
 ORDER BY 1,2;" 2>&1

echo ""
echo "=== 3. Kolom HANYA DI STAGING (nilainya tidak bisa masuk) ==="
docker exec "$DB" psql -U postgres -d "$LOCAL" -c "
WITH s AS (
  SELECT table_name, column_name FROM information_schema.columns
   WHERE table_schema='_staging'
), p AS (
  SELECT table_name, column_name FROM information_schema.columns
   WHERE table_schema='public' AND table_name IN (SELECT table_name FROM s)
)
SELECT s.table_name, s.column_name
  FROM s LEFT JOIN p USING (table_name, column_name)
 WHERE p.column_name IS NULL ORDER BY 1,2;" 2>&1

echo ""
echo "=== 4. Kolom HANYA DI TUJUAN (biarkan NULL / default) ==="
docker exec "$DB" psql -U postgres -d "$LOCAL" -c "
WITH s AS (
  SELECT table_name, column_name FROM information_schema.columns
   WHERE table_schema='_staging'
), p AS (
  SELECT table_name, column_name, is_nullable, column_default FROM information_schema.columns
   WHERE table_schema='public' AND table_name IN (SELECT table_name FROM s)
)
SELECT p.table_name, p.column_name, p.is_nullable,
       coalesce(p.column_default,'-') AS default_tujuan
  FROM p LEFT JOIN s USING (table_name, column_name)
 WHERE s.column_name IS NULL ORDER BY 1,2;" 2>&1

echo ""
echo "=== 5. managed_departments: isi di staging ==="
docker exec "$DB" psql -U postgres -d "$LOCAL" -c \
  "SELECT id, managed_departments FROM _staging.users
    WHERE managed_departments IS NOT NULL AND managed_departments <> '{}'
    ORDER BY name;" 2>&1
echo "  daftar divisi yang tersedia di staging.departments:"
docker exec "$DB" psql -U postgres -d "$LOCAL" -c \
  "SELECT id, name FROM _staging.departments ORDER BY name;" 2>&1