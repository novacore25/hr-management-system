#!/bin/sh
# Log container sejak migrasi data.
#
# Skrip ini dikirim sebagai berkas, bukan ditulis inline di perintah ssh.
# Perintah dengan heredoc inline selalu dihancurkan PowerShell sebelum
# sampai ke VPS (AGENTS.md §3.19).
set -u
APP=$(docker ps --format '{{.Names}}' | grep '^rredcbao7tqz34pkqeelf8xx' | head -1)

if [ -z "$APP" ]; then
  echo "TIDAK ADA container aktif"
  exit 1
fi

echo "=== container ==="
echo "  $APP"
docker inspect "$APP" --format '  image={{.Config.Image}}  started={{.State.StartedAt}}  restart={{.RestartCount}}'

echo ""
echo "=== baris log sejak 2 jam lalu ==="
docker logs --since 2h "$APP" 2>&1 | wc -l

echo ""
echo "=== baris yang mengandung kata error ==="
docker logs --since 2h "$APP" 2>&1 \
  | grep -icE 'error|fatal|exception|ECONNREFUSED|invalid input|does not exist|cannot' \
  | sed 's/^/  jumlah: /'

echo ""
echo "=== 15 baris terakhir yang mengandung pola itu ==="
docker logs --since 2h "$APP" 2>&1 \
  | grep -iE 'error|fatal|exception|ECONNREFUSED|invalid input|does not exist|cannot' \
  | tail -15 | cut -c1-180 | sed 's/^/  /'

echo ""
echo "=== 10 baris log terakhir, apa adanya ==="
docker logs --since 2h "$APP" 2>&1 | tail -10 | cut -c1-180 | sed 's/^/  /'

echo ""
echo "=== apakah container sempat restart? ==="
docker inspect "$APP" --format '  StartedAt={{.State.StartedAt}}  RestartCount={{.RestartCount}}  OOMKilled={{.State.OOMKilled}}'