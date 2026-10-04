#!/bin/sh
# attendance menghasilkan hash kosong di sisi Supabase. Itu bukan
# "data berbeda", itu query-nya yang gagal -- errornya sengaja
# ditutup dengan 2>/dev/null di skrip sebelumnya, jadi penyebabnya
# tidak terlihat. Sekarang errornya dibiarkan tampil.
set -u
DB=vlu8rdt1abda7g69vbiwsk4p
LOCAL=db_hr_system
ENV_FILE=/root/.supabase-pg.env

# shellcheck disable=SC1090
set -a
. "$ENV_FILE"
set +a

Q="SELECT md5(coalesce(string_agg(x.b, E'\n' ORDER BY x.b), ''))
    FROM (SELECT t::text AS b FROM attendance t) x;"

echo "=== 1. Query bermasalah, error dibiarkan terlihat (Supabase) ==="
docker exec -e PGPASSWORD="$SUPABASE_PG_PASSWORD" "$DB" \
  psql -h "$SUPABASE_PG_HOST" -p "$SUPABASE_PG_PORT" \
  -U "$SUPABASE_PG_USER" -d "$SUPABASE_PG_DB" -Atc "$Q" 2>&1 | sed 's/^/  /'

echo ""
echo "=== 2. Query sama di sisi staging ==="
docker exec "$DB" psql -U postgres -d db_hr_system -Atc \
  "SELECT md5(coalesce(string_agg(x.b, E'\n' ORDER BY x.b), ''))
     FROM (SELECT t::text AS b FROM _staging.attendance t) x;" 2>&1 | sed 's/^/  /'

echo ""
echo "=== 3. Cari kolom yang mungkin jadi penyebab ==="
echo "  tipe data tiap kolom attendance:"
docker exec -e PGPASSWORD="$SUPABASE_PG_PASSWORD" "$DB" \
  psql -h "$SUPABASE_PG_HOST" -p "$SUPABASE_PG_PORT" \
  -U "$SUPABASE_PG_USER" -d "$SUPABASE_PG_DB" -c \
  "SELECT column_name, data_type
     FROM information_schema.columns
    WHERE table_schema='public' AND table_name='attendance'
    ORDER BY ordinal_position;" 2>&1 | sed 's/^/  /'

echo ""
echo "=== 4. Coba tanpa t::text, pakai row_to_json ==="
docker exec -e PGPASSWORD="$SUPABASE_PG_PASSWORD" "$DB" \
  psql -h "$SUPABASE_PG_HOST" -p "$SUPABASE_PG_PORT" \
  -U "$SUPABASE_PG_USER" -d "$SUPABASE_PG_DB" -Atc \
  "SELECT count(*) FROM (SELECT row_to_json(t) AS j FROM attendance t) x;" \
  2>&1 | sed 's/^/  /'

echo ""
echo "=== 5. Coba md5 per kolom, satu per satu, untuk cari yang gagal ==="
for c in id user_id date check_in check_out status type location_in \
         location_status late_fine late_reason late_reason_status \
         radius_penalty early_checkout early_reason notes created_at updated_at; do
  v=$(docker exec -e PGPASSWORD="$SUPABASE_PG_PASSWORD" "$DB" \
    psql -h "$SUPABASE_PG_HOST" -p "$SUPABASE_PG_PORT" \
    -U "$SUPABASE_PG_USER" -d "$SUPABASE_PG_DB" -Atc \
    "SELECT md5(coalesce(string_agg(coalesce(\"$c\"::text,'~'), '' ORDER BY coalesce(\"$c\"::text,'~')), ''))
       FROM attendance;" 2>&1 | tr -d '\n')
  w=$(docker exec "$DB" psql -U postgres -d db_hr_system -Atc \
    "SELECT md5(coalesce(string_agg(coalesce(\"$c\"::text,'~'), '' ORDER BY coalesce(\"$c\"::text,'~')), ''))
       FROM _staging.attendance;" 2>&1 | tr -d '\n')
  if [ "$v" = "$w" ]; then
    printf "  %-20s SAMA  %s\n" "$c" "$v"
  else
    printf "  %-20s BEDA  SB=%s  ST=%s\n" "$c" "$v" "$w"
  fi
done