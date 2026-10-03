#!/bin/sh
# Cek produksi dengan percobaan ulang dan bypass DNS.
#
# Kenapa bypass: resolver 1.1.1.1 di VPS ini timeout ~35% (7 dari 20
# lookup gagal). Akibatnya curl kadang membalas "HTTP 000" setelah
# menunggu 10 detik -- padahal aplikasinya sehat. Itu sudah sempat
# menyesatkan sekali: hasil check terlihat seperti aplikasi tumbang.
#
# `--resolve` mengikat hostname ke IP, sehingga hasil pemeriksaan tidak
# bergantung pada resolver sama sekali.
set -u
PREFIX=rredcbao7tqz34pkqeelf8xx
DOMAIN="${PREFIX}.168.231.118.146.sslip.io"

# Cari IP sekali di awal. Kalau gagal, pakai IP VPS langsung.
IP="168.231.118.146"
DITEMUKAN=$(timeout 8 getent hosts "$DOMAIN" 2>/dev/null | awk '{print $1}' | head -1)
if [ -n "$DITEMUKAN" ]; then
  IP="$DITEMUKAN"
fi

# get: retry sampai 3 kali, pakai --resolve supaya DNS tidak ikut.
get() {
  _i=1
  while [ "$_i" -le 3 ]; do
    _code=$(curl -s -o /tmp/body.$$ -w "%{http_code}" \
      --resolve "$DOMAIN:443:$IP" --max-time 20 "$1")
    if [ "$_code" != "000" ]; then
      printf "%s" "$_code"
      cat /tmp/body.$$ 2>/dev/null
      rm -f /tmp/body.$$
      return 0
    fi
    _i=$((_i + 1))
  done
  printf "%s" "000"
  rm -f /tmp/body.$$
  return 1
}

echo "=== 0. DNS dilewati; IP yang dipakai: $IP ==="

echo ""
echo "=== 1. Health (harus status:ok) ==="
get "https://${DOMAIN}/api/health" | head -c 300 | sed 's/^/  /'
echo ""

echo ""
echo "=== 2. Halaman (200 = ada, 302 = arahkan ke login) ==="
for path in / /login /absensi/home; do
  code=$(get "https://${DOMAIN}${path}" | head -c 3)
  printf "  %-16s %s\n" "$path" "$code"
done

echo ""
echo "=== 3. Endpoint terproteksi (401 = guard hidup, 500 = ada masalah) ==="
for ep in /api/me /api/departments /api/kpis /api/absensi/settings \
          /api/overtime /api/payroll /api/feedbacks; do
  out=$(get "https://${DOMAIN}${ep}")
  code=$(printf "%s" "$out" | head -c 3)
  msg=$(printf "%s" "$out" | tail -c +4 | head -c 60)
  printf "  %-24s %s  %s\n" "$ep" "$code" "$msg"
done

echo ""
echo "=== 4. Aset (text/css = benar; text/plain = build menabrak dev) ==="
CSS=$(curl -s --resolve "$DOMAIN:443:$IP" --max-time 20 "https://${DOMAIN}/" \
      | grep -o '/_next/static/css/[a-zA-Z0-9]*\.css' | head -1)
if [ -n "$CSS" ]; then
  curl -s -o /dev/null --resolve "$DOMAIN:443:$IP" \
    -w "  %{content_type}  HTTP %{http_code}  $CSS\n" \
    "https://${DOMAIN}${CSS}"
else
  echo "  (tidak ada tag CSS ditemukan)"
fi