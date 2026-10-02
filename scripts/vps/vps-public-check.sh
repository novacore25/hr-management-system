#!/bin/sh
# Cek lewat domain publik (bukan 127.0.0.1).
#
# Penting: kalau dicek dari dalam container, host-nya 127.0.0.1:3000
# sedangkan AUTH_URL berisi domain publik -- jadi /api/health melaporkan
# "warning". Itu bukan masalah. Lewat domain publik hasilnya "ok".
set -u

echo "=== 1. Host publik: health harus status=ok ==="
curl -s -o /tmp/h.json -w "  HTTP %{http_code}  %{time_total}s\n" \
  https://rredcbao7tqz34pkqeelf8xx.168.231.118.146.sslip.io/api/health
if [ -f /tmp/h.json ]; then
  node -e "
const t = require('fs').readFileSync('/tmp/h.json','utf8');
try {
  const j = JSON.parse(t);
  console.log('  status  :', j.status);
  console.log('  db      :', j.db);
  console.log('  problems:', (j.problems || []).join(' | ') || '(tidak ada)');
} catch (e) { console.log('  (bukan JSON):', t.slice(0,200)); }
" 2>/dev/null || cat /tmp/h.json | head -5
fi

echo ""
echo "=== 2. Halaman utama & login (harus 200, tanpa redirect loop) ==="
for path in / /login /absensi/home; do
  code=$(curl -s -o /dev/null -w "%{http_code}" \
    "https://rredcbao7tqz34pkqeelf8xx.168.231.118.146.sslip.io${path}")
  echo "  $path -> HTTP $code"
done

echo ""
echo "=== 3. Endpoint terproteksi tanpa sesi (harus 401, bukan 500) ==="
for ep in /api/me /api/departments /api/kpis /api/absensi/settings \
          /api/overtime /api/payroll /api/feedbacks; do
  body=$(curl -s -o /tmp/b.txt -w "%{http_code}" \
    "https://rredcbao7tqz34pkqeelf8xx.168.231.118.146.sslip.io${ep}")
  printf "  %-24s HTTP %s  %s\n" "$ep" "$body" \
    "$(head -c 90 /tmp/b.txt | tr -d '\n')"
done

echo ""
echo "=== 4. Aset ter-build (CSS/JS harus 200, BUKAN text/plain) ==="
CSS=$(curl -s https://rredcbao7tqz34pkqeelf8xx.168.231.118.146.sslip.io/ \
      | grep -o '/_next/static/css/[a-zA-Z0-9]*\.css' | head -1)
if [ -n "$CSS" ]; then
  curl -s -o /dev/null \
    -w "  %{content_type}  HTTP %{http_code}  $CSS\n" \
    "https://rredcbao7tqz34pkqeelf8xx.168.231.118.146.sslip.io${CSS}"
else
  echo "  (tidak ada tag CSS di HTML)"
fi