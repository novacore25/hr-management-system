#!/bin/sh
# Enam kegagalan terakhir tidak punya pesan error apa pun: build-nya
# dibatalkan (#11 CANCELED, "Gracefully shutting down build container").
# Itu bentuk yang sama dengan build yang dibunuh karena kehabisan
# memori atau karena ada build lain yang lebih baru.
#
# Yang dicari: bukti OOM, dan apa container 6ve3f9zqfkypblr0f0cea4jm
# itu -- namanya muncul sebagai --add-host di perintah build.

cat > /tmp/h1.sh <<'XEOF'
set -u
echo "=== 1. OOM kill di kernel? ==="
dmesg -T 2>/dev/null | grep -iE 'out of memory|oom-kill|killed process' | tail -12 \
  | cut -c1-170 | sed 's/^/  /' || echo "  (dmesg tidak bisa dibaca atau tidak ada entri)"

echo ""
echo "=== 2. Memori host sekarang ==="
free -m | sed 's/^/  /'

echo ""
echo "=== 3. Swap? ==="
swapon --show 2>/dev/null | sed 's/^/  /' || echo "  tidak ada swap"
XEOF
cat /tmp/h1.sh | sh

cat > /tmp/h2.sh <<'XEOF'
set -u
echo ""
echo "=== 4. Apa itu 6ve3f9zqfkypblr0f0cea4jm? ==="
echo "  (nama ini muncul sebagai --add-host di perintah docker build)"
docker inspect 6ve3f9zqfkypblr0f0cea4jm \
  --format '  image={{.Config.Image}}  nama={{.Name}}  status={{.State.Status}}  health={{.State.Health.Status}}' 2>&1 | sed 's/^/  /'
docker inspect 6ve3f9zqfkypblr0f0cea4jm --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
  | grep -iE 'role|proxy|server|coolify|port' | sed 's/^/    /'

echo ""
echo "=== 5. Semua container unhealthy ==="
docker ps -a --format '  {{.Names}} | {{.Image}} | {{.Status}}' | grep -i unhealthy | sed 's/^/  /'

echo ""
echo "=== 6. Beban Docker saat ini ==="
docker stats --no-stream --format '  {{.Name}} CPU={{.CPUPerc}} MEM={{.MemUsage}}' 2>/dev/null | head -14
XEOF
cat /tmp/h2.sh | sh

cat > /tmp/h3.sh <<'XEOF'
set -u
echo ""
echo "=== 7. Ruang disk (build-butuh ruang untuk layer) ==="
df -h / /var/lib/docker 2>/dev/null | sed 's/^/  /'
echo ""
echo " -images Docker:"
docker system df 2>/dev/null | sed 's/^/  /'

echo ""
echo "=== 8. Berapa container build yang pernah ada? ==="
docker ps -a --format '{{.Names}}' | grep -cE '^[a-z0-9]{20}$' || true
echo "  (container build Coolify dihapus setelah selesai)"
XEOF
cat /tmp/h3.sh | sh