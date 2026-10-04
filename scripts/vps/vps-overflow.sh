#!/bin/sh
# Dry run gagal di kpi_assignments:
# "A field with precision 7, scale 2 must round to an absolute value
#  less than 10^5".
#
# numeric(7,2) hanya muat 99999.99. Ada nilai yang lebih besar dari
# itu. Yang tidak boleh dilakukan adalah membiarkan casting memotong
# nilai itu -- itu kehilangan data, persis hal yang paling ingin
# dihindari.
#
# Busca semua kolom bertipe numeric(p,s) sekaligus. Menemukannya satu
# per satu saat migrasi berjalan terlalu lambat, dan setiap putaran
# berarti satu percobaan baru.
set -u
DB=vlu8rdt1abda7g69vbiwsk4p
LOCAL=db_hr_system

echo "=== 1. Distribusi achievement_percentage di staging ==="
docker exec "$DB" psql -U postgres -d "$LOCAL" -c \
  "SELECT count(*) AS total,
          count(*) FILTER (WHERE achievement_percentage IS NULL) AS kosong,
          min(achievement_percentage) AS terkecil,
          max(achievement_percentage) AS terbesar,
          count(*) FILTER (WHERE achievement_percentage > 99999.99) AS melebihi_batas
     FROM _staging.kpi_assignments;" 2>&1

echo ""
echo "=== 2. Baris yang melebihi batas ==="
docker exec "$DB" psql -U postgres -d "$LOCAL" -c \
  "SELECT id, year, month, monthly_target, actual_total, expected_total,
          achievement_percentage
     FROM _staging.kpi_assignments
    WHERE achievement_percentage > 99999.99
    ORDER BY achievement_percentage DESC;" 2>&1

echo ""
echo "=== 3. Semua kolom numeric(p,s) di tabel tujuan ==="
docker exec "$DB" psql -U postgres -d "$LOCAL" -c "
SELECT c.relname AS tabel, a.attname AS kolom,
       format_type(a.atttypid, a.atttypmod) AS tipe
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r'
   AND format_type(a.atttypid, a.atttypmod) LIKE 'numeric(%'
   AND c.relname IN (SELECT table_name FROM information_schema.columns
                      WHERE table_schema = '_staging')
 ORDER BY 1, 2;" 2>&1

echo ""
echo "=== 4. Uji semua kolom itu sekaligus: nilai terbesar di staging ==="
echo "  Hasil yang penting: kolom mana yang tidak muat."
docker exec "$DB" psql -U postgres -d "$LOCAL" -c "
SELECT 'kpi_assignments.monthly_target' AS kolom, max(monthly_target)::text FROM _staging.kpi_assignments
UNION ALL SELECT 'kpi_assignments.actual_total', max(actual_total)::text FROM _staging.kpi_assignments
UNION ALL SELECT 'kpi_assignments.expected_total', max(expected_total)::text FROM _staging.kpi_assignments
UNION ALL SELECT 'kpi_assignments.current_daily_target', max(current_daily_target)::text FROM _staging.kpi_assignments
UNION ALL SELECT 'kpi_assignments.achievement_percentage', max(achievement_percentage)::text FROM _staging.kpi_assignments
UNION ALL SELECT 'kpi_assignments.weight', max(weight)::text FROM _staging.kpi_assignments
UNION ALL SELECT 'kpis.target_value', max(target_value)::text FROM _staging.kpis
UNION ALL SELECT 'kpis.min_value', max(min_value)::text FROM _staging.kpis
UNION ALL SELECT 'kpis.max_value', max(max_value)::text FROM _staging.kpis
UNION ALL SELECT 'payrolls.base_salary', max(base_salary)::text FROM _staging.payrolls
UNION ALL SELECT 'payrolls.total', max(total)::text FROM _staging.payrolls
UNION ALL SELECT 'monthly_scores.total_score', max(total_score)::text FROM _staging.monthly_scores
 ORDER BY 1;" 2>&1