#!/bin/sh
# Uji apakah runtime image bisa dibangun TANPA internet.
#
# Cara paling jujur: bekukan jaringan di dalam build. Kalau build
# berhasil tanpa jaringan, berarti tidak ada lagi yang perlu diunduh
# -- dan penyebab kegagalan deployment yang enam kali itu benar-benar
# hilang, bukan cuma disembunyikan.
#
# --network none membuat build tidak punya jalur keluar sama sekali.

set -u
NAMA_IMAGE="hrtest-tanpa-jaringan"
SUMBER="${1:-/root/hr-test-src}"

echo "=== 1. Apa yang akan diuji ==="
echo "  image : $NAMA_IMAGE"
echo "  sumber: $SUMBER"
if [ ! -f "$SUMBER/Dockerfile" ]; then
  echo "  ERROR: tidak ada Dockerfile di $SUMBER" >&2
  exit 1
fi
echo "  Dockerfile: $(grep -c '^RUN' "$SUMBER/Dockerfile") instruksi RUN"

echo ""
echo "=== 2. Build dengan --network none ==="
echo "  (kalau ini berhasil, tidak ada lagi unduhan saat build)"
docker build --network none -t "$NAMA_IMAGE" "$SUMBER" > /tmp/build-nonet.log 2>&1
RC=$?
echo "  kode keluar: $RC"
echo ""
echo "=== 3. 30 baris terakhir ==="
tail -30 /tmp/build-nonet.log | cut -c1-170 | sed 's/^/  /'

echo ""
echo "=== 4. Ringkasan langkah ==="
grep -E '^#[0-9]+ (\[|DONE|ERROR|CACHED)' /tmp/build-nonet.log | tail -20 | cut -c1-150 | sed 's/^/  /'

echo ""
echo "=== 5. Gagal di langkah mana? ==="
grep -nE 'ERROR|error:|did not complete|CANCELED' /tmp/build-nonet.log | head -8 | cut -c1-170 | sed 's/^/  /' || echo "  (tidak ada)"

echo ""
if [ "$RC" -eq 0 ]; then
  echo "=== HASIL: build BERHASIL tanpa jaringan ==="
  echo "  Penyebab kegagalan deployment sudah hilang."
  echo ""
  echo "  Cek isi image:"
  docker run --rm --network none "$NAMA_IMAGE" sh -c \
    'echo "  wget ada   : $(command -v wget || echo TIDAK)"; echo "  curl ada   : $(command -v curl || echo 'tidak ada, dan itu memang tujuannya')"; echo "  zona waktu : $(date +%Z)"; echo "  user       : $(id -un)"' 2>&1 | sed 's/^/  /'
else
  echo "=== HASIL: build GAGAL tanpa jaringan ==="
  echo "  Masih ada langkah yang butuh internet."
fi