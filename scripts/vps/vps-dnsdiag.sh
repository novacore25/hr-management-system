#!/bin/sh
# Diduga: DNS resolution, bukan koneksi.
#
# Bukti yang mengarah ke sini: `time_connect 0.000000s` sementara
# `time_total` ~9.9s. Kalau gzipnya koneksi TCP, connect akan
# tercatat. 9.9 detik juga ~= 2 x 5 detik, pola retry resolver.
set -u
PREFIX=rredcbao7tqz34pkqeelf8xx
HOST="${PREFIX}.168.231.118.146.sslip.io"

echo "=== 1. Resolver yang dipakai host ==="
cat /etc/resolv.conf | grep -vE '^\s*#' | grep . | sed 's/^/  /'

echo ""
echo "=== 2. Lookup 10 kali, catat waktunya ==="
i=1
while [ "$i" -le 10 ]; do
  printf "  %2s  %s\n" "$i" "$( { time -p getent hosts "$HOST" >/dev/null 2>&1; } 2>&1 | tr '\n' ' ')"
  i=$((i + 1))
done

echo ""
echo "=== 3. Lookup dengan timeout jelas (timeout 3 getent) ==="
i=1
GAGAL=0
while [ "$i" -le 12 ]; do
  if timeout 3 getent hosts "$HOST" >/dev/null 2>&1; then
    printf "  %2s  OK\n" "$i"
  else
    printf "  %2s  GAGAL / timeout (>3s)\n" "$i"
    GAGAL=$((GAGAL + 1))
  fi
  i=$((i + 1))
done
echo "  gagal: $GAGAL dari 12"

echo ""
echo "=== 4.Bypass DNS? (curl --resolve) ==="
IP=$(timeout 5 getent hosts "$HOST" | awk '{print $1}' | head -1)
if [ -n "$IP" ]; then
  echo "  IP: $IP"
  i=1
  while [ "$i" -le 6 ]; do
    printf "  %s  %s\n" "$i" "$(curl -s -o /dev/null --resolve "$HOST:443:$IP" \
      -w 'HTTP %{http_code} %{time_total}s' --max-time 15 "https://${HOST}/api/health")"
    i=$((i + 1))
  done
else
  echo "  (tidak bisa dapat IP)"
fi

echo ""
echo "=== 5. Nameserver yang dipakai, diuji langsung ==="
for NS in $(grep -E '^nameserver' /etc/resolv.conf | awk '{print $2}'); do
  printf "  %s: " "$NS"
  if command -v dig >/dev/null 2>&1; then
    timeout 5 dig +short "$HOST" @$NS 2>&1 | head -1
  else
    echo "(tanpa dig)"
  fi
done