#!/bin/sh
# Bandingkan resolver dengan cara BERGILIR, bukan berurutan.
#
# Version sebelumnya menguji satu resolver sampai selesai, baru pindah
# ke berikutnya. Kalau kondisi jaringan berubah-ubah, perbandingan itu
# tidak sah: resolver yang diuji belakangan bisa dapat periode lebih
# baik atau lebih buruk dan itu ada hubungannya dengan waktu,
# resolver itu sendiri.
#
# Yang terjadi di tes sebelumnya:
#   dig +short ke 1.1.1.1  -> 25/25
#   beberapa menit kemudian, di tes berikutnya:
#   dig A ke 1.1.1.1       -> 21/25
#
# Resolve-nya berubah sendiri. Jadi yang diukur bukan resolver-nya,
# tapi kondisi jaringan saat itu.
#
# Di sini semua resolver diuji pada detik yang sama, berulang kali.

set -u
DOMAIN="dl-cdn.alpinelinux.org"
ROUNDS=20

RESOLVER="1.1.1.1 8.8.8.8 9.9.9.9 208.67.222.222 1.0.0.1"

# Inisialisasi penghitung
for r in $RESOLVER; do
  eval "OK_$(echo "$r" | tr '.' '_')=0"
  eval "GAGAL_$(echo "$r" | tr '.' '_')=0"
done

echo "=== $ROUNDS giliran, tiap giliran semua resolver diuji ==="
echo "  (resolver diuji bergantian, bukan berurutan)"
echo ""

i=1
while [ "$i" -le "$ROUNDS" ]; do
  for r in $RESOLVER; do
    KUNCI=$(echo "$r" | tr '.' '_')
    if dig +short +time=2 +tries=1 "@$r" "$DOMAIN" >/dev/null 2>&1; then
      eval "OK_$KUNCI=\$(( \${OK_$KUNCI} + 1 ))"
    else
      eval "GAGAL_$KUNCI=\$(( \${GAGAL_$KUNCI} + 1 ))"
    fi
  done
  i=$((i + 1))
done

echo "=== Hasil ==="
printf "  %-18s %-10s %s\n" RESOLVER BERHASIL GAGAL
echo "  ------------------------------------------"
for r in $RESOLVER; do
  KUNCI=$(echo "$r" | tr '.' '_')
  eval "O=\${OK_$KUNCI}"
  eval "G=\${GAGAL_$KUNCI}"
  printf "  %-18s %-10s %s\n" "$r" "$O/$ROUNDS" "$G"
done

echo ""
echo "=== Apakah ada yang benar-benar berbeda? ==="
TERBAIK=0
TERBURUK=0
for r in $RESOLVER; do
  KUNCI=$(echo "$r" | tr '.' '_')
  eval "G=\${GAGAL_$KUNCI}"
  [ "$G" -eq 0 ] && TERBAIK=$((TERBAIK + 1))
  [ "$G" -ge 5 ] && TERBURUK=$((TERBURUK + 1))
done
echo "  resolver tanpa kegagalan : $TERBAIK dari 5"
echo "  resolver dengan >=5 gagal: $TERBURUK dari 5"
echo ""
if [ "$TERBURUK" -eq 0 ]; then
  echo "  Kesimpulan: TIDAK ADA resolver yang jelas lebih baik."
  echo "  Ganti resolver kemungkinan besar tidak memperbaiki apa pun."
elif [ "$TERBAIK" -ge 2 ]; then
  echo "  Kesimpulan: ada resolver yang konsisten succeeds tanpa kegagalan."
  echo "  Ganti resolver layak dicoba."
else
  echo "  Kesimpulan: hasilnya campuran, belum bisa simpulkan."
fi