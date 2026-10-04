#!/bin/sh
# Healthcheck gagal dengan "wget: can't connect to remote host:
# Connection refused", padahal Next.js sudah "Ready in 257ms" dan
# mendengarkan di 0.0.0.0:3000.
#
# "Connection refused" berarti tidak ada yang mendengarkan di alamat
# yang dicoba wget -- bukan timeout, bukan DNS gagal.
#
# Dugaan: di Alpine, `localhost` resolve ke ::1 (IPv6) lebih dulu,
# sedangkan Next.js hanya_BIND ke 0.0.0.0 (IPv4). Jadi wget mencoba
# IPv6 dan ditolak.
#
# Diuji dengan server yang benar-benar mendengarkan, lalu wget
# dicoba dengan `localhost` dan `127.0.0.1`.

set -u

echo "=== 1. Apa yang di-resolve `localhost` di dalam Alpine? ==="
timeout 120 docker run --rm node:22-alpine sh -c \
  'cat /etc/hosts; echo "---"; cat /etc/nsswitch.conf 2>/dev/null; echo "--- getent localhost ---"; getent hosts localhost; echo "--- getent ahosts localhost ---"; getent ahosts localhost' 2>&1 \
  | sed 's/^/  /'

echo ""
echo "=== 2. Server bunyi di 0.0.0.0:3000, lalu wget dicoba dua cara ==="
timeout 240 docker run --rm node:22-alpine sh -c '
node -e "require(\"http\").createServer((q,s)=>{s.end(\"{\\\"status\\\":\\\"ok\\\"}\")}).listen(3000,\"0.0.0.0\")" &
sleep 4

echo "  --- listener aktif ---"
netstat -ltn 2>/dev/null | grep 3000 || echo "  (netstat tidak ada)"

echo "  --- wget dengan localhost ---"
wget -q -O - http://localhost:3000/api/health 2>&1 | head -2 || echo "  GAGAL (localhost)"
echo "  kode keluar: $?"

echo "  --- wget dengan 127.0.0.1 ---"
wget -q -O - http://127.0.0.1:3000/api/health 2>&1 | head -2 || echo "  GAGAL (127.0.0.1)"
echo "  kode keluar: $?"
' 2>&1 | sed 's/^/  /'

echo ""
echo "=== 3. Ulangi lebih sering untuk melihat mana yang konsisten gagal ==="
timeout 300 docker run --rm node:22-alpine sh -c '
node -e "require(\"http\").createServer((q,s)=>s.end(\"ok\")).listen(3000,\"0.0.0.0\")" &
sleep 4
l_ok=0; l_gagal=0; i_ok=0; i_gagal=0
i=1
while [ "$i" -le 10 ]; do
  wget -q -O - http://localhost:3000/api/health >/dev/null 2>&1 && l_ok=$((l_ok+1)) || l_gagal=$((l_gagal+1))
  wget -q -O - http://127.0.0.1:3000/api/health >/dev/null 2>&1 && i_ok=$((i_ok+1)) || i_gagal=$((i_gagal+1))
  i=$((i+1))
done
echo "  localhost  : $l_ok berhasil, $l_gagal gagal"
echo "  127.0.0.1  : $i_ok berhasil, $i_gagal gagal"
' 2>&1 | sed 's/^/  /'