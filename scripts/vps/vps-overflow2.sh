#!/bin/sh
# Sebaiknya achievement_percentage widened, bukan nilainya dipotong.
# Tapi sebelum menentukan lebarnya, cek semua kolom yang mungkin
# mengalami overflow, sekaligus cek apakah kolom yang sama ada di
# monthly_scores (ditemukan dari skema aplikasi, bukan dari tebakan).
set -u
DB=vlu8rdt1abda7g69vbiwsk4p
LOCAL=db_hr_system

echo "=== 1. Semua kolom numeric di staging, nilai terbesar & terkecil ==="
echo "  (dibatasi ke kolom yang di tujuan bertipe numeric(p,s))"
docker exec "$DB" psql -U postgres -d "$LOCAL" -c "
SELECT c.relname AS tabel, a.attname AS kolom,
       format_type(a.atttypid, a.atttypmod) AS tipe_tujuan
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r'
   AND format_type(a.atttypid, a.atttypmod) LIKE 'numeric(%'
   AND c.relname IN (SELECT table_name FROM information_schema.columns
                      WHERE table_schema = '_staging')
 ORDER BY 1, 2;" 2>&1

echo ""
echo "=== 2. monthly_scores: berapa achievement_percentage terbesar? ==="
docker exec "$DB" psql -U postgres -d "$LOCAL" -c \
  "SELECT count(*) AS total, min(achievement_percentage) AS terkecil,
          max(achievement_percentage) AS terbesar,
          count(*) FILTER (WHERE achievement_percentage > 99999.99) AS melebihi_batas
     FROM _staging.monthly_scores;" 2>&1

echo ""
echo "=== 3. Semua kolom kpis dan monthly_scores bertipe numeric di staging ==="
docker exec "$DB" psql -U postgres -d "$LOCAL" -c \
  "SELECT table_name, column_name, data_type, numeric_precision, numeric_scale
     FROM information_schema.columns
    WHERE table_schema = '_staging'
      AND table_name IN ('kpis','monthly_scores')
      AND data_type = 'numeric'
    ORDER BY table_name, column_name;" 2>&1

echo ""
echo "=== 4. Uji semua kolom numeric sekaligus: muat atau tidak ==="
echo "  Setiap baris di bawah di-cast ke tipe tujuan. Kalau ada yang"
echo "  tidak muat, PostgreSQL akan memberi tahu kolomnya."
for pair in \
  "kpi_assignments:monthly_target:numeric(15,2)" \
  "kpi_assignments:actual_total:numeric(15,2)" \
  "kpi_assignments:achievement_percentage:numeric(7,2)" \
  "kpi_assignments:expected_total:numeric(15,2)" \
  "kpi_assignments:current_daily_target:numeric(15,2)" \
  "kpi_assignments:weight:numeric" \
  "monthly_scores:monthly_target:numeric(15,2)" \
  "monthly_scores:actual_total:numeric(15,2)" \
  "monthly_scores:achievement_percentage:numeric(7,2)" \
  "daily_reports:value:numeric(15,2)" \
  "absensi_settings:office_lat:numeric(12,8)" \
  "absensi_settings:office_lng:numeric(12,8)" \
  "office_locations:lat:numeric(12,8)" \
  "office_locations:lng:numeric(12,8)" \
  "overtime_requests:hourly_base_rate:numeric(15,2)" \
  "overtime_requests:total_overtime_pay:numeric(15,2)" \
  "payrolls:base_salary:numeric(15,2)" \
  "payrolls:deductions:numeric(15,2)" \
  "payrolls:mobility_allowance:numeric(15,2)" \
  "payrolls:overtime_pay:numeric(15,2)" \
  "payrolls:overtime_rate:numeric(15,2)" \
  "payrolls:performance_bonus:numeric(15,2)" \
  "payroll_staff_settings:default_base_salary:numeric(15,2)" \
  "payroll_staff_settings:default_mobility_allowance:numeric(15,2)" ; do
  tbl=$(printf "%s" "$pair" | cut -d: -f1)
  col=$(printf "%s" "$pair" | cut -d: -f2)
  tipe=$(printf "%s" "$pair" | cut -d: -f3)
  r=$(docker exec "$DB" psql -U postgres -d "$LOCAL" -Atc \
    "SELECT max(\"$col\")::text || ' | ' || count(*)::text || ' | ' || min(\"$col\")::text
       FROM _staging.\"$tbl\";" 2>&1 | head -1)
  # Uji cast sebenarnya; ini yang menangkap overflow.
  c=$(docker exec "$DB" psql -U postgres -d "$LOCAL" -Atc \
    "SELECT count(\"$col\"::${tipe}) FROM _staging.\"$tbl\" WHERE \"$col\" IS NOT NULL;" 2>&1 | head -2 | tr '\n' ' ')
  printf "  %-46s %-16s %s\n" "$tbl.$col" "$tipe" "$c"
done