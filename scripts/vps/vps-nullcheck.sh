#!/bin/sh
# Dry run kedua gagal di payrolls:
#   null value in column "payroll_overtime_minutes" violates not-null
#
# Pemetaan kolom sebelumnya hanya membandingkan TIPE, bukan NULLABILITY.
# Jadi kolom yang tipenya sama tapi di staging nullable dan di tujuan
# NOT NULL lolos dari pemeriksaan itu. Semua kolom seperti itu dicari
# sekarang sekaligus, bukan satu per satu.
set -u
DB=vlu8rdt1abda7g69vbiwsk4p
LOCAL=db_hr_system

echo "=== 1. Kolom yang nullable di staging tapi NOT NULL di tujuan ==="
echo "  Ini kelas bug yang paling berbahaya: tipenya cocok, jadi lolos"
echo "  pemeriksaan tipe, tapi nilainya bisa NULL."
docker exec "$DB" psql -U postgres -d "$LOCAL" -c "
WITH s AS (
  SELECT table_name, column_name, is_nullable FROM information_schema.columns
   WHERE table_schema = '_staging'
), p AS (
  SELECT table_name, column_name, is_nullable, column_default
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name IN (SELECT table_name FROM information_schema.columns
                         WHERE table_schema = '_staging')
)
SELECT s.table_name, s.column_name, p.is_nullable AS nullable_di_tujuan,
       coalesce(p.column_default, '(tanpa default)') AS default_tujuan,
       (SELECT count(*) FROM _staging.\"' || s.table_name || '\" x
         WHERE x.\"' || s.column_name || '\"' IS NULL) AS null_di_staging
  FROM s JOIN p USING (table_name, column_name)
 WHERE s.is_nullable = 'YES' AND p.is_nullable = 'NO'
 ORDER BY 1,2;" 2>&1

echo ""
echo "=== 2. payroll_overtime_minutes:lebih dekat ==="
echo "  di staging:"
docker exec "$DB" psql -U postgres -d "$LOCAL" -c \
  "SELECT count(*) AS total,
          count(*) FILTER (WHERE payroll_overtime_minutes IS NULL) AS null,
          min(payroll_overtime_minutes) AS terkecil,
          max(payroll_overtime_minutes) AS terbesar
     FROM _staging.payrolls;" 2>&1
echo "  di tujuan:"
docker exec "$DB" psql -U postgres -d "$LOCAL" -c \
  "SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payrolls'
      AND column_name = 'payroll_overtime_minutes';" 2>&1

echo ""
echo "=== 3. Semua kolom NOT NULL tanpa default di tabel tujuan ==="
echo "  Kolom seperti ini wajib diisi INSERT, dan tidak bisa diselamatkan"
echo "  oleh default."
docker exec "$DB" psql -U postgres -d "$LOCAL" -c "
SELECT p.table_name, p.column_name, p.data_type,
       CASE WHEN s.column_name IS NULL THEN 'tidak ada di staging'
            ELSE 'ada di staging' END AS asal
  FROM information_schema.columns p
  LEFT JOIN information_schema.columns s
    ON s.table_schema = '_staging' AND s.table_name = p.table_name
   AND s.column_name = p.column_name
 WHERE p.table_schema = 'public'
   AND p.is_nullable = 'NO'
   AND p.column_default IS NULL
   AND p.table_name IN (SELECT table_name FROM information_schema.columns
                         WHERE table_schema = '_staging')
 ORDER BY (s.column_name IS NULL) DESC, 1,2;" 2>&1