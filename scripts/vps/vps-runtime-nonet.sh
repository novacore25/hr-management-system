#!/bin/sh
# Uji perintah runtime yang baru TANPA jaringan.
#
# `--network none` untuk seluruh build tidak bisa dipakai sebagai uji,
# karena `npm ci` memang butuh internet. Jadi yang diuji hanya
# perintah-perintah di tahap runtime -- bagian yang enam kali gagal.
#
# Yang diuji persis seperti yang akan dijalankan Dockerfile baru.

set -u

echo "=== 1. addgroup dan adduser tanpa jaringan ==="
timeout 120 docker run --rm --network none node:22-alpine sh -c \
  'addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs && echo "  addgroup/adduser: OK" && id nextjs' 2>&1 | sed 's/^/  /'

echo ""
echo "=== 2.yalin /etc/localtime tanpa jaringan ==="
timeout 120 docker run --rm --network none node:22-alpine sh -c \
  'if [ -f /usr/share/zoneinfo/Asia/Jakarta ]; then cp /usr/share/zoneinfo/Asia/Jakarta /etc/localtime && echo "Asia/Jakarta" > /etc/timezone && echo "  /etc/localtime: OK"; else echo "  /etc/localtime: berkas tidak ada, langkah dilewati (itu tujuan dari if)"; fi' 2>&1 | sed 's/^/  /'

echo ""
echo "=== 3. BusyBox `wget` ada? (pengganti curl) ==="
timeout 120 docker run --rm --network none node:22-alpine sh -c \
  'command -v wget && echo "  wget: ADA" || echo "  wget: TIDAK ADA"' 2>&1 | sed 's/^/  /'
timeout 120 docker run --rm --network none node:22-alpine sh -c \
  'command -v curl >/dev/null && echo "  curl: ada (dari image dasar)" || echo "  curl: tidak ada -> inilah alasan wget dipakai"' 2>&1 | sed 's/^/  /'

echo ""
echo "=== 4. Health check dengan wget, tanpa jaringan luar ==="
echo "  (server dummy di dalam container, hanya localhost)"
timeout 180 docker run --rm --network none node:22-alpine sh -c '
  node -e "require(\"http\").createServer((q,s)=>{s.writeHead(200,{\"Content-Type\":\"application/json\"});s.end(JSON.stringify({status:\"ok\"}))}).listen(3000)" &
  sleep 3
  echo "  jawaban wget: $(wget -q -O - http://localhost:3000/api/health)"
  if wget -q -O - http://localhost:3000/api/health > /dev/null; then echo "  health check: LOLOS (exit 0)"; else echo "  health check: GAGAL"; fi
  echo "  -- dan kalau server mati, harus gagal: --"
  if wget -q -O - http://localhost:3999/tidak-ada > /dev/null 2>&1; then echo "  tidak sengaja LOLOS (buruk)"; else echo "  GAGAL dengan benar (bagus)"; fi
' 2>&1 | sed 's/^/  /'

echo ""
echo "=== 5. Zona waktu dari ENV TZ tanpa berkas zoneinfo ==="
timeout 120 docker run --rm --network none -e TZ=Asia/Jakarta node:22-alpine sh -c \
  'node -e "console.log(\"  Intl timezone: \" + Intl.DateTimeFormat().resolvedOptions().timeZone); console.log(\"  tanggal        : \" + new Date().toString())"' 2>&1 | sed 's/^/  /'

echo ""
echo "=== 6. Ringkasan: apakah masih ada yang perlu internet? ==="
echo "  addgroup/adduser : tidak"
echo "  cp /etc/localtime: tidak"
echo "  health check wget: tidak (localhost)"
echo "  ENV TZ           : tidak"
echo ""
echo "  Kalau semua benar, tahap runtime tidak lagi menyentuh jaringan."