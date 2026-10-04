#!/bin/sh
# Persiapan sebelum bikin schema staging.
#
# Dua hal yang harus diketahui lebih dulu, tanpa membocorkan rahasia:
#   1. Nama variabel apa saja yang ada di /root/.supabase-pg.env.
#      Yang dicetak hanya NAMA variabel, bukan nilainya.
#   2. Di mana pg_dump bisa dijalankan: di host, atau hanya di dalam
#      container database.
set -u

ENV_FILE=/root/.supabase-pg.env

echo "=== 1. Berkas kredensial ==="
if [ -f "$ENV_FILE" ]; then
  ls -l "$ENV_FILE" | awk '{print "  mode: " $1 "  pemilik: " $3}'
  echo "  nama variabel (nilai tidak dicetak):"
  grep -oE '^[A-Za-z_][A-Za-z0-9_]*' "$ENV_FILE" | sed 's/^/    /'
else
  echo "  TIDAK ADA: $ENV_FILE"
  exit 1
fi

echo ""
echo "=== 2. pg_dump di host? ==="
if command -v pg_dump >/dev/null 2>&1; then
  echo "  host: $(command -v pg_dump)"
  pg_dump --version | sed 's/^/  versi: /'
  echo "  CATATAN: pg_dump hanya bisa dump server yang versinya"
  echo "  sama atau lebih baru. Supabase di PG 17.6, jadi pg_dump 14"
  echo "  di host akan gagal dengan 'server version mismatch'."
  echo "  Yang dipakai nanti adalah pg_dump 18.6 di dalam container."
else
  echo "  host: tidak ada"
fi

echo ""
echo "=== 3. pg_dump di dalam container database? ==="
DB=vlu8rdt1abda7g69vbiwsk4p
if docker exec "$DB" pg_dump --version >/dev/null 2>&1; then
  docker exec "$DB" pg_dump --version | sed 's/^/  versi: /'
else
  echo "  tidak ada"
fi

echo ""
echo "=== 4. psql di host? ==="
if command -v psql >/dev/null 2>&1; then
  psql --version | sed 's/^/  versi: /'
else
  echo "  host: tidak ada (pakai psql di dalam container)"
fi

echo ""
echo "=== 5. Koneksi ke Supabase (uji nyata, tanpa mencetak password) ==="
# shellcheck disable=SC1090
set -a
. "$ENV_FILE"
set +a

# Nama variabel bisa berbeda antar skrip, jadi cari yang terisi.
HOSTV=""
USERV=""
PASSV=""
NAMAV=""
for pasangan in "SUPABASE_PG_HOST SUPABASE_PG_USER SUPABASE_PG_PASSWORD SUPABASE_PG_DB SUPABASE_PG_PORT" \
                "SUPABASE_DB_HOST SUPABASE_DB_USER SUPABASE_DB_PASSWORD SUPABASE_DB_NAME SUPABASE_DB_PORT" \
                "DB_HOST DB_USER DB_PASSWORD DB_NAME DB_PORT" \
                "PGHOST PGUSER PGPASSWORD PGDATABASE PGPORT"; do
  # shellcheck disable=SC2086
  set -- $pasangan
  eval "h=\${$1:-}"; eval "u=\${$2:-}"; eval "p=\${$3:-}"; eval "n=\${$4:-}"
  eval "pt=\${$5:-5432}"
  if [ -n "$h" ] && [ -n "$u" ] && [ -n "$p" ]; then
    HOSTV="$h"; USERV="$u"; PASSV="$p"; NAMAV="$n"; PORTV="$pt"
    echo "  memakai kelompok variabel: $1 $2 $3 $4 $5"
    break
  fi
done

if [ -z "$HOSTV" ]; then
  echo "  TIDAK ADA kelompok variabel host/user/password yang terisi"
  echo "  isi berkas:"
  sed 's/=.*/=<disembunyikan>/' "$ENV_FILE" | sed 's/^/    /'
  exit 1
fi

# Database default untuk proyek Supabase biasanya postgres.
[ -z "$NAMAV" ] && NAMAV=postgres

echo "  host: $HOSTV"
echo "  port: $PORTV"
echo "  user: $USERV"
echo "  database: $NAMAV"
echo "  password: (terisi, ${#PASSV} karakter, tidak dicetak)"

echo ""
echo "  hasil:"
docker exec -e PGPASSWORD="$PASSV" "$DB" \
  psql -h "$HOSTV" -p "$PORTV" -U "$USERV" -d "$NAMAV" -Atc \
  "SELECT '  terhubung, versi: ' || current_setting('server_version');" 2>&1 | cut -c1-200