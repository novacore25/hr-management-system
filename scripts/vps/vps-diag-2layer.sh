#!/bin/sh
# Dua hal yang perlu diperjelas setelah verifikasi 2 tahap:
#
# 1. Cek pertama ("hrRoleAvailability TIDAK ADA") tidak valid. Build
#    produksi minify nama fungsi, jadi fungsi ekspor tidak pernah
#    namanya sama di .next. Yang tidak berubah hanya LITERAL STRING.
#    Jadi yang harus dicari adalah potongan pesan error dari DAL, bukan
#    nama fungsinya.
#
# 2. HTTP 000 dari domain publik -- itu bukan 500. 000 berarti curl
#    tidak dapat respons sama sekali. Perlu dibedakan: apakah path ke
#    domain publik memang tidak bisa dari VPS ke dirinya sendiri, atau
#    aplikasinya sendiri yang tidak menjawab.

set -u
APP=$(docker ps --format '{{.Names}}' | grep '^rredcbao7tqz34pkqeelf8xx' | head -1)
DOMAIN="hr.168.231.118.146.sslip.io"

echo "=== 1. Literal string dari DAL (tahan minify) ==="
echo "  Nama fungsi tidak akan ditemukan -- itu normal, bukan bug."
echo "  Yang dicari:"
for S in "hanya untuk role kpi_role=" "sudah disetujui executive" "Giliran" "belum disetujui executive"; do
  N=$(docker exec "$APP" sh -c "grep -rl '$S' /app/.next 2>/dev/null | wc -l" 2>/dev/null | tr -d ' ')
  echo "  $N file  |$S|"
done

echo ""
echo "=== 2. Bukti lain bahwa kode DAL ikut ter-deploy ==="
echo "  route.js harus punya blok view=approvals. Cari kata kuncinya:"
for S in "waitingHr" "hrAvailable" "pendingStaffCount"; do
  N=$(docker exec "$APP" sh -c "grep -rl '$S' /app/.next 2>/dev/null | wc -l" 2>/dev/null | tr -d ' ')
  echo "  $N file  $S"
done

echo ""
echo "=== 3. Apakah aplikasi menjawab dari DALAM container? ==="
docker exec "$APP" sh -c \
  "wget -q -O - http://127.0.0.1:3000/api/health" 2>&1 | head -c 300 | sed 's/^/  /'
echo ""

echo ""
echo "=== 4. Apakah container yang sama menjawab dari luar (port map)? ==="
PORTS=$(docker port "$APP" 2>/dev/null | tr '\n' ' ')
echo "  port map: ${PORTS:-tidak ada}"
if [ -n "$PORTS" ]; then
  P=$(echo "$PORTS" | head -1 | sed 's/.*://')
  echo "  mencoba 127.0.0.1:$P/api/health"
  curl -s -o /dev/null -w "  HTTP %{http_code}\n" --max-time 10 "http://127.0.0.1:${P}/api/health"
fi

echo ""
echo "=== 5. Kenapa domain publik 000? ==="
echo "  a) DNS dari VPS untuk domain itu:"
timeout 8 getent hosts "$DOMAIN" 2>&1 | sed 's/^/     /'
echo "  b) curl tanpa --resolve:"
curl -s -o /dev/null -w "     HTTP %{http_code}\n" --max-time 15 "https://${DOMAIN}/api/health"
echo "  c) lewat proxy Coolify (container coolify-proxy, port dalam):"
docker exec coolify-proxy sh -c \
  "wget -q -O - --header='Host: $DOMAIN' http://127.0.0.1/api/health" 2>&1 \
  | head -c 250 | sed 's/^/     /'
echo ""
echo "  d) label Traefik di container aplikasi:"
docker inspect "$APP" --format '{{range $k,$v := .Config.Labels}}{{println $k "=" $v}}{{end}}' 2>/dev/null \
  | grep -i 'traefik' | cut -c1-150 | sed 's/^/     /'