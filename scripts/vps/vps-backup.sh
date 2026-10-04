#!/bin/sh
# Backup database produksi SEBELUM migrasi data.
#
# Produksi saat ini nyaris kosong, tapi "nyaris kosong" bukan "kosong":
# ada 1 user, 3 divisi, 3 letter_types, dan sekarang 37 kolom baru.
# Kalau migrasi gagal di tengah jalan, tanpa backup tidak ada jalan
# kembali yang murah.
set -u
DB=vlu8rdt1abda7g69vbiwsk4p
LOCAL=db_hr_system
TANGGAL=$(date +%Y%m%d-%H%M%S)
TUJUAN="/root/backups"
# TANPA ekstensi .gz di nama. Versi pertama menamainya
# "...sql.gz" lalu menjalankan `gzip -f`, yang menambah .gz lagi --
# hasilnya ".sql.gz.gz", dan semua langkah sesudahnya mencari nama
# yang salah sehingga backup terlihat hilang padahal isinya ada.
BERKAS="$TUJUAN/before-data-migration-$TANGGAL.sql"

mkdir -p "$TUJUAN"

echo "=== 1. Ruang disk ==="
df -h /var/lib/docker 2>/dev/null | tail -1 | sed 's/^/  /' || df -h / | tail -1 | sed 's/^/  /'

echo ""
echo "=== 2. Ukuran database sekarang ==="
docker exec "$DB" psql -U postgres -d "$LOCAL" -Atc \
  "SELECT pg_size_pretty(pg_database_size('$LOCAL'));" | sed 's/^/  /'

echo ""
echo "=== 3. Dump ==="
docker exec "$DB" pg_dump -U postgres -d "$LOCAL" --clean --if-exists \
  > "$BERKAS" 2>/tmp/dump.err
RC=$?
if [ "$RC" -ne 0 ]; then
  echo "  GAGAL (kode $RC):"
  cat /tmp/dump.err | sed 's/^/    /'
  rm -f "$BERKAS"
  exit 1
fi
gzip -f "$BERKAS"
GZ="$BERKAS.gz"

echo ""
echo "=== 4. Hasil ==="
if [ ! -f "$GZ" ]; then
  echo "  GAGAL: $GZ tidak terbentuk" >&2
  exit 1
fi
ls -lh "$GZ" | awk '{print "  ukuran: " $5}'
echo "  baris di dalam: $(gunzip -c "$GZ" | wc -l)"

echo ""
echo "=== 5. Sanity: isi backup ==="
gunzip -c "$GZ" | grep -c '^CREATE TABLE' | sed 's/^/  jumlah CREATE TABLE: /'
gunzip -c "$GZ" | grep -c '^COPY ' | sed 's/^/  jumlah COPY: /'

echo ""
echo "=== 6. Daftar backup yang tersedia ==="
ls -lh "$TUJUAN" 2>/dev/null | tail -5 | sed 's/^/  /'

echo ""
echo "Backup: $GZ"
echo "Untuk memulihkan:"
echo "  gunzip -c $GZ | docker exec -i $DB psql -U postgres -d $LOCAL"