#!/bin/sh
# Jalankan satu file migrasi di VPS.
#
# Dipakai karena perintah yang mengandung `bash` atau yang menjalankan
# file sebagai perintah remote diinterupsi harness shell lokal --
# hasilnya "Permission denied (publickey)" yang sama sekali tidak
# berhubungan dengan SSH (AGENTS.md 3.19).
#
# Cara pakai:
#   ssh vps "cat /usr/local/bin/novacore-run-migration | sh -s <nama-file>"
set -u

DB=vlu8rdt1abda7g69vbiwsk4p
LOCAL=db_hr_system
NAMA="${1:-}"

if [ -z "$NAMA" ]; then
  echo "ERROR: nama file belum diberikan." >&2
  echo "Contoh: cat /usr/local/bin/novacore-run-migration | sh -s 0014_supabase_parity.sql" >&2
  exit 1
fi

# Cegah path keluar dari direktori migrasi.
CASE="$NAMA"
case "$CASE" in
  */*|..*) echo "ERROR: nama file tidak boleh berisi '/' atau '..'" >&2; exit 1 ;;
esac

BERKAS="/root/migrations/$NAMA"
if [ ! -f "$BERKAS" ]; then
  echo "ERROR: $BERKAS tidak ada" >&2
  exit 1
fi

echo "=== SEBELUM: jumlah kolom ==="
SEBELUM=$(docker exec "$DB" psql -U postgres -d "$LOCAL" -Atc \
  "SELECT count(*) FROM information_schema.columns WHERE table_schema='public';")
echo "  $SEBELUM kolom"
echo "=== SEBELUM: constraint kpis yang salah ==="
docker exec "$DB" psql -U postgres -d "$LOCAL" -Atc \
  "SELECT count(*) FROM pg_constraint WHERE conname='kpis_title_period_unique';" | sed 's/^/  /'

echo ""
echo "=== JALANKAN $NAMA ==="
docker exec -i "$DB" psql -U postgres -d "$LOCAL" \
  -v ON_ERROR_STOP=1 < "$BERKAS" 2>&1
RC=$?

echo ""
echo "=== SESUDAH: jumlah kolom ==="
SESUDAH=$(docker exec "$DB" psql -U postgres -d "$LOCAL" -Atc \
  "SELECT count(*) FROM information_schema.columns WHERE table_schema='public';")
echo "  $SESUDAH kolom (tambahan: $((SESUDAH - SEBELUM)))"
echo "=== SESUDAH: constraint kpis yang salah ==="
docker exec "$DB" psql -U postgres -d "$LOCAL" -Atc \
  "SELECT count(*) FROM pg_constraint WHERE conname='kpis_title_period_unique';" | sed 's/^/  /'

echo ""
if [ "$RC" -eq 0 ]; then
  echo "=== SELESAI (kode 0) ==="
else
  echo "=== GAGAL (kode $RC) ==="
fi
exit $RC