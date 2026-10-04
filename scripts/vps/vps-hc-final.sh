#!/bin/sh
# Uji persis perintah healthcheck yang akan dipakai Coolify, dengan
# kondisi yang sama: Alpine, server Next.js mendengarkan di 0.0.0.0,
# dan perintah dijalankan sebagai user non-root.
#
# Kesalahan sebelumnya: saya mengganti `curl` dengan `wget` dan
# committing tanpa mengujinya. Healthcheck itu gagal karena `localhost`
# resolve ke ::1 di Alpine, dan seluruh deployment dibatalkan --
# padahal build-nya sendiri sudah berhasil.
#
# Jadi: jangan percaya perintah healthcheck sampai dia dibuktikan
# jalan di image yang benar.

set -u
CMD_HC='wget -q -O - http://127.0.0.1:3000/api/health > /dev/null'

echo "=== 1. Uji 10 kali, persis seperti Coolify memanggilnya ==="
timeout 300 docker run --rm node:22-alpine sh -c "
node -e 'require(\"http\").createServer((q,s)=>{s.writeHead(200,{\"Content-Type\":\"application/json\"});s.end(JSON.stringify({status:\"ok\",db:\"connected\"}))}).listen(3000,\"0.0.0.0\")' &
sleep 5
OK=0; GAGAL=0
i=1
while [ \$i -le 10 ]; do
  if $CMD_HC; then OK=\$((OK+1)); else GAGAL=\$((GAGAL+1)); echo \"    percobaan \$i GAGAL\"; fi
  i=\$((i+1))
done
echo \"  berhasil: \$OK dari 10\"
echo \"  gagal   : \$GAGAL\"
" 2>&1 | sed 's/^/  /'

echo ""
echo "=== 2. Healthcheck harus GAGAL kalau server-nya mati ==="
echo "  (kalau ini lolos, healthcheck-nya tidak berguna)"
timeout 200 docker run --rm node:22-alpine sh -c "
if $CMD_HC; then echo '  LOLOS tanpa server -- BURUK'; else echo '  GAGAL dengan benar -- bagus'; fi
" 2>&1 | sed 's/^/  /'

echo ""
echo "=== 3. Apa yang di-resolve `localhost` di Alpine? ==="
timeout 120 docker run --rm node:22-alpine sh -c \
  'echo "  localhost  -> $(getent hosts localhost)"; echo "  127.0.0.1  -> $(getent hosts 127.0.0.1)"' 2>&1 | sed 's/^/  /'

echo ""
echo "=== 4. Cek perintah lain di Dockerfile yang mungkin bermasalah ==="
echo "  semua instruksi RUN dan CMD di tahap runtime:"
timeout 120 docker run --rm node:22-alpine sh -c \
  'echo "    addgroup : $(command -v addgroup || echo TIDAK)"; echo "    adduser  : $(command -v adduser || echo TIDAK)"; echo "    wget     : $(command -v wget || echo TIDAK)"' 2>&1 | sed 's/^/  /'