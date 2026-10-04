#!/bin/sh
# Bangun schema _staging di produksi: 23 tabel dengan struktur Supabase,
# TANPA batasan apa pun (tanpa PK, FK, UNIQUE, index, trigger, RLS).
#
# Kenapa tanpa batasan: staging cuma tempat menurunkan data mentah.
# Batasan hanya menambah alasan gagal (misalnya urutan muat harus
# benar), dan tidak menambah nilai apa pun untuk tujuan verifikasi
# jumlah baris. Batasan yang penting sudah ada di tabel tujuan.
#
# Aturan ekstraksi diambil dari isi dump yang sudah diperiksa:
#   - 23 CREATE TABLE, 0 CREATE TYPE, 0 CREATE SEQUENCE
#   - 10 CREATE FUNCTION, 10 CREATE TRIGGER, 51 CREATE POLICY  -> dibuang
#   - 9 CREATE INDEX, 64 ADD CONSTRAINT                        -> dibuang
set -u
DB=vlu8rdt1abda7g69vbiwsk4p
LOCAL=db_hr_system
SUMBER=/root/migrations/supabase-schema-only.sql
DDL=/root/migrations/staging-ddl.sql
HARGA_EXPECTED=23

echo "=== 1. Ambil hanya blok CREATE TABLE ==="
awk '
  /^CREATE TABLE public\./ { dalam = 1 }
  dalam { print }
  dalam && /^\);$/ { dalam = 0 }
' "$SUMBER" > "$DDL"

JUMLAH=$(grep -c '^CREATE TABLE public\.' "$DDL")
TUTUP=$(grep -c '^);$' "$DDL")
echo "  blok CREATE TABLE: $JUMLAH (harus $HARGA_EXPECTED)"
echo "  penutup ');'    : $TUTUP"
if [ "$JUMLAH" -ne "$HARGA_EXPECTED" ] || [ "$TUTUP" -ne "$HARGA_EXPECTED" ]; then
  echo "  GAGAL: ekstraksi tidak lengkap. Tidak dilanjutkan."
  exit 1
fi

echo ""
echo "=== 2. Cek tabel yang kolomnya memanggil schema lain ==="
# auth.users atau storage.objects akan gagal kalau tidak ada di produksi.
if grep -nE '\b(auth|storage|extensions)\.' "$DDL" | head -5; then
  echo "  PERINGATAN: ada kolom yang memanggil schema lain (lihat di atas)."
  echo "  Periksa manual sebelum lanjut."
else
  echo "  bersih: tidak ada pemanggilan ke schema auth/storage/extensions"
fi

echo ""
echo "=== 3. Ganti prefix public. menjadi _staging. ==="
sed 's/^CREATE TABLE public\./CREATE TABLE _staging./' "$DDL" > /tmp/staging-ddl.sql
mv /tmp/staging-ddl.sql "$DDL"
echo "  dialokasikan: $(grep -c '^CREATE TABLE _staging\.' "$DDL") tabel"
echo "  sisa 'public.': $(grep -c 'public\.' "$DDL" || true)"

echo ""
echo "=== 4. Schema _staging sudah ada sebelumnya? ==="
ADA=$(docker exec "$DB" psql -U postgres -d "$LOCAL" -Atc \
  "SELECT count(*) FROM information_schema.schemata WHERE schema_name='_staging';")
echo "  _staging ada: $ADA"
if [ "$ADA" != "0" ]; then
  TBL=$(docker exec "$DB" psql -U postgres -d "$LOCAL" -Atc \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='_staging';")
  echo "  tabel di dalamnya: $TBL"
  echo "  PENTING: skrip ini akan MENGHAPUS schema lama. Hentikan kalau"
  echo "  ada data di sana yang belum pernah Anda periksa."
  read -r JAWAB </dev/tty 2>/dev/null || JAWAB=""
  if [ "$JAWAB" != "ya" ]; then
    echo "  Dibatalkan."
    exit 1
  fi
fi

echo ""
echo "=== 5. Buat schema dan tabel ==="
docker exec "$DB" psql -U postgres -d "$LOCAL" -v ON_ERROR_STOP=1 -c \
  "DROP SCHEMA IF EXISTS _staging CASCADE;" 2>&1 | sed 's/^/  /'
docker exec "$DB" psql -U postgres -d "$LOCAL" -v ON_ERROR_STOP=1 \
  -c "CREATE SCHEMA _staging;" 2>&1 | sed 's/^/  /'

# DDL dialirkan dari berkas, bukan disisipkan lewat $(cat ...).
# Command substitution akan membiarkan DDL melewati lapisan shell satu
# kali lagi, dan DDL bisa saja memuat karakter yang berubah artinya di
# sana. Dialirkan apa adanya, tidak ada yang diurai ulang.
docker exec -i "$DB" psql -U postgres -d "$LOCAL" -v ON_ERROR_STOP=1 \
  < "$DDL" 2>&1 | tail -8 | sed 's/^/  /'
RC=$?
if [ "$RC" -ne 0 ]; then
  echo "  GAGAL membuat tabel staging (kode $RC)"
  exit 1
fi

echo ""
echo "=== 6. Hasil ==="
docker exec "$DB" psql -U postgres -d "$LOCAL" -c \
  "SELECT table_name,
          (SELECT count(*) FROM information_schema.columns c
            WHERE c.table_schema='_staging' AND c.table_name=t.table_name) AS kolom
     FROM information_schema.tables t
    WHERE table_schema='_staging'
    ORDER BY table_name;" 2>&1
docker exec "$DB" psql -U postgres -d "$LOCAL" -Atc \
  "SELECT '  TOTAL kolom staging: ' || count(*) FROM information_schema.columns
   WHERE table_schema='_staging';"

echo ""
echo "=== 7. Batasan di staging (harus nol) ==="
docker exec "$DB" psql -U postgres -d "$LOCAL" -Atc \
  "SELECT '  constraint: ' || count(*) FROM pg_constraint c
     JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='_staging';"

echo ""
echo "DDL: $DDL"