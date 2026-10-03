#!/bin/sh
# HTTP 000 bergantian dengan hang ~10 detik, padahal CPU 0.02%.
# App-nya sehat; masalahnya di jalur koneksi.
set -u
PREFIX=rredcbao7tqz34pkqeelf8xx
DOMAIN="${PREFIX}.168.231.118.146.sslip.io"

echo "=== 1. Satu request per baris, 10 kali ==="
i=1
while [ "$i" -le 10 ]; do
  printf "  %2s  %s\n" "$i" "$(curl -s -o /dev/null \
    -w 'HTTP %{http_code}  %{time_connect}s connect  %{time_starttransfer}s TTFB' \
    --max-time 20 "https://${DOMAIN}/api/health")"
  i=$((i + 1))
done

echo ""
echo "=== 2. Dari dalam VPS langsung ke 127.0.0.1 (melewati jaringan luar) ==="
APP=$(docker ps --format '{{.Names}}' | grep "^$PREFIX" | head -1)
docker exec "$APP" node -e "
(async () => {
  for (let i = 1; i <= 6; i++) {
    const t = Date.now();
    try {
      const r = await fetch('http://127.0.0.1:3000/api/health');
      await r.text();
      console.log('  ' + i + '  ' + r.status + '  ' + (Date.now() - t) + 'ms');
    } catch (e) {
      console.log('  ' + i + '  GAGAL  ' + e.message + '  ' + (Date.now() - t) + 'ms');
    }
  }
})();
" 2>&1

echo ""
echo "=== 3. Apa yang listening di host? ==="
ss -tlnp 2>/dev/null | grep -E ':80|:443|:3000' | sed 's/^/  /' || \
  netstat -tlnp 2>/dev/null | grep -E ':80|:443|:3000' | sed 's/^/  /'

echo ""
echo "=== 4. Apakah ada reverse proxy (traefik/nginx/caddy)? ==="
docker ps --format '  {{.Names}} | {{.Image}}' | grep -iE 'traefik|nginx|caddy|coolify' || \
  echo "  (tidak ada)"

echo ""
echo "=== 5. 3 baris error yang tercatat ==="
docker logs "$APP" 2>&1 | grep -iE 'error|fatal|exception' | tail -5 | cut -c1-160 | sed 's/^/  /'

echo ""
echo "=== 6. Pola dari sisi VPS ke domain publik (localhost ke dirinya sendiri) ==="
i=1
while [ "$i" -le 5 ]; do
  printf "  %s  %s\n" "$i" "$(curl -s -o /dev/null \
    -w 'HTTP %{http_code}  %{time_total}s' --max-time 20 \
    "https://${DOMAIN}/api/health")"
  i=$((i + 1))
done