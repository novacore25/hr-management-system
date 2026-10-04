#!/bin/sh
# Konfirmasi: kegagalan build disebabkan resolver yang rusak.
#
# Bukti dari log Coolify:
#   fetching https://dl-cdn.alpinelinux.org/... DNS: transient error
#   ERROR: unable to select packages: curl, tzdata (no such package)
#
# apk add gagal karena tidak bisa mengunduh indeks paket, bukan karena
# paketnya tidak ada. Kalau resolvernya baik, domain itu normal
# ter-answer dalam hitungan milidetik.
set -u

HOSTS="dl-cdn.alpinelinux.org registry-1.docker.io github.com proxy.golang.org"

echo "=== 1. Apakah domain build bisa dijawab? 12 kali per host ==="
printf "  %-30s %-16s %s\n" HOST BERHASIL GAGAL
for h in $HOSTS; do
  OK=0; GAGAL=0
  i=1
  while [ "$i" -le 12 ]; do
    if timeout 4 getent hosts "$h" >/dev/null 2>&1; then
      OK=$((OK + 1))
    else
      GAGAL=$((GAGAL + 1))
    fi
    i=$((i + 1))
  done
  printf "  %-30s %-16s %s\n" "$h" "$OK" "$GAGAL"
done

echo ""
echo "=== 2. Apakah pesan errornya sama dengan yang di log Coolify? ==="
echo "  (apk-add di dalam container alpine, dengan resolver sekarang)"
timeout 90 docker run --rm alpine:3.20 sh -c \
  'apk add --no-cache tzdata 2>&1 | tail -6' 2>&1 | cut -c1-160 | sed 's/^/  /'

echo ""
echo "=== 3. Ulangi yang sama tapi resolver-nya diganti ke Quad9 ==="
echo "  (membuktikan penyebabnya resolver, bukan alpine atau paketnya)"
timeout 120 docker run --rm --dns 9.9.9.9 alpine:3.20 sh -c \
  'apk add --no-cache tzdata 2>&1 | tail -4; echo "exit=$?"' 2>&1 \
  | cut -c1-160 | sed 's/^/  /'

echo ""
echo "=== 4. Resolver yang dipakai di dalam container ==="
timeout 60 docker run --rm alpine:3.20 cat /etc/resolv.conf 2>&1 | grep -vE '^#|^$' | sed 's/^/  /'