#!/bin/sh
# Dua tabel punya jumlah baris sama tapi checksum berbeda:
#   attendance    3430 = 3430,  md5 beda
#   daily_reports 4992 = 4992,  md5 beda
#
# Dugaan: itu bukan data rusak, tapi urutan baris. Perintah
# `COPY (SELECT * FROM t) TO STDOUT` tanpa ORDER BY mengembalikan baris
# sesuai urutan fisik, dan urutan fisik berbeda antara database yang
# datanya masuk lewat COPY dan yang sudah lama berisi. Baris berbeda,
# isi identik.
#
# Cara memastikan: checksum yang tidak bergantung pada urutan, yaitu
# semua baris diurutkan lebih dulu sebelum di-hash.
set -u
DB=vlu8rdt1abda7g69vbiwsk4p
LOCAL=db_hr_system
ENV_FILE=/root/.supabase-pg.env

# shellcheck disable=SC1090
set -a
. "$ENV_FILE"
set +a

TABEL="absensi_logs absensi_settings attendance company_letters daily_reports department_locations departments feedbacks holidays kpi_assignments kpi_histories kpi_settings kpis leave_requests letter_types monthly_scores office_locations overtime_requests payroll_addition_types payroll_deduction_types payroll_staff_settings payrolls users"

# md5 dari seluruh baris yang sudah diurutkan. t::text menghasilkan
# representasi teks yang deterministik untuk setiap baris.
TEKS="md5(coalesce(string_agg(x.b, E'\n' ORDER BY x.b), '')) FROM (SELECT t::text AS b FROM %s t) x"

suhash() {
  docker exec -e PGPASSWORD="$SUPABASE_PG_PASSWORD" "$DB" \
    psql -h "$SUPABASE_PG_HOST" -p "$SUPABASE_PG_PORT" \
    -U "$SUPABASE_PG_USER" -d "$SUPABASE_PG_DB" -Atc \
    "SELECT $(printf "$TEKS" "public.\"$1\"");" 2>/dev/null
}

sthash() {
  docker exec "$DB" psql -U postgres -d "$LOCAL" -Atc \
    "SELECT $(printf "$TEKS" "_staging.\"$1\"");" 2>/dev/null
}

echo "=== A. Dua tabel yang tadi beda, dicek ulang tanpa bergantung urutan ==="
for t in attendance daily_reports; do
  a=$(suhash "$t"); b=$(sthash "$t")
  if [ "$a" = "$b" ] && [ -n "$a" ]; then
    printf "  %-16s SAMA  %s\n" "$t" "$a"
  else
    printf "  %-16s BEDA  SB=%s  ST=%s\n" "$t" "$a" "$b"
  fi
done

echo ""
echo "=== B. Kedua tabel itu dicek juga kolom per kolom ==="
echo "  (kalau masih beda, berarti ada kolom yang benar-benar isinya beda)"
echo ""
echo "  -- attendance --"
docker exec -e PGPASSWORD="$SUPABASE_PG_PASSWORD" "$DB" \
  psql -h "$SUPABASE_PG_HOST" -p "$SUPABASE_PG_PORT" \
  -U "$SUPABASE_PG_USER" -d "$SUPABASE_PG_DB" -Atc \
  "SELECT string_agg(c.column_name, ',' ORDER BY c.ordinal_position)
     FROM information_schema.columns c
    WHERE c.table_schema='public' AND c.table_name='attendance';" \
  | tr ',' '\n' | sed 's/^/    /'