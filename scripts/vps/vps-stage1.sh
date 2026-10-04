#!/bin/sh
# Ambil struktur schema public dari Supabase, lalu periksa isinya.
#
# Belum ada yang diubah di produksi. Ini hanya membaca dan menyimpan
# salinan DDL ke /root/migrations/supabase-schema-only.sql supaya
# aturan ekstraksi tabelnya bisa ditentukan dari bukti, bukan dari
# tebakan.
set -u
DB=vlu8rdt1abda7g69vbiwsk4p
ENV_FILE=/root/.supabase-pg.env
KELUARAN=/root/migrations/supabase-schema-only.sql

# shellcheck disable=SC1090
set -a
. "$ENV_FILE"
set +a

echo "=== 1. Dump schema-only dari Supabase (pg_dump 18.6 di container) ==="
# pg_dump di host versi 14 tidak bisa membaca server PG 17, jadi
# WAJIB lewat container.
docker exec -e PGPASSWORD="$SUPABASE_PG_PASSWORD" "$DB" \
  pg_dump -h "$SUPABASE_PG_HOST" -p "$SUPABASE_PG_PORT" \
  -U "$SUPABASE_PG_USER" -d "$SUPABASE_PG_DB" \
  --schema-only --no-owner --no-privileges --no-comments \
  -n public > "$KELUARAN" 2>/tmp/sb.err
RC=$?
if [ "$RC" -ne 0 ]; then
  echo "  GAGAL (kode $RC):"
  sed 's/^/    /' /tmp/sb.err | cut -c1-200
  exit 1
fi
echo "  ukuran: $(wc -l < "$KELUARAN") baris"

echo ""
echo "=== 2. Isi dump, dikelompokkan menurut jenis pernyataan ==="
for pola in "CREATE TABLE" "CREATE TYPE" "CREATE SEQUENCE" \
            "CREATE INDEX" "CREATE UNIQUE INDEX" "CREATE VIEW" \
            "CREATE MATERIALIZED VIEW" "CREATE FUNCTION" \
            "CREATE TRIGGER" "ALTER TABLE ONLY" "ADD CONSTRAINT" \
            "CREATE EXTENSION" "CREATE SCHEMA" "CREATE POLICY" \
            "ALTER DEFAULT"; do
  n=$(grep -c "^$pola\|^  $pola\| $pola " "$KELUARAN" 2>/dev/null || true)
  [ -z "$n" ] && n=0
  printf "  %-28s %s\n" "$pola" "$n"
done

echo ""
echo "=== 3. Daftar CREATE TABLE ==="
grep -oE '^CREATE TABLE [a-z_.]+' "$KELUARAN" | sed 's/CREATE TABLE public\./  /' | sort

echo ""
echo "=== 4. Daftar tipe enum ==="
grep -oE '^CREATE TYPE [a-z_.]+' "$KELUARAN" | sed 's/CREATE TYPE public\./  /' | sort

echo ""
echo "=== 5. Tipe yang dipanggil kolom tapi mungkin tidak ada di produksi kita ==="
# Bandingkan nama tipe yang muncul di dump dengan yang ada di produksi.
echo "  di dump Supabase:"
grep -oE 'CREATE TYPE public\.[a-z0-9_]+' "$KELUARAN" | sed 's/CREATE TYPE public\.//' | sort -u | sed 's/^/    /'
echo "  di produksi kita:"
docker exec "$DB" psql -U postgres -d db_hr_system -Atc \
  "SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
   WHERE t.typtype='e' AND n.nspname='public' ORDER BY 1;" | sed 's/^/    /'

echo ""
echo "=== 6. Contoh satu CREATE TABLE utuh ==="
awk '/^CREATE TABLE public\.users/,/^\);/' "$KELUARAN" | head -45 | sed 's/^/  /'

echo ""
echo "Berkas: $KELUARAN"