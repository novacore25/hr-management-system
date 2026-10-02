#!/bin/sh
# Tampilkan /api/health lengkap (pretty-printed) tanpa truncation.
set -u

PREFIX=rredcbao7tqz34pkqeelf8xx
APP=$(docker ps --format '{{.Names}}' | grep "^${PREFIX}" | head -1)
if [ -z "$APP" ]; then
  echo "container tidak ditemukan"
  exit 1
fi

echo "=== /api/health (mentah) ==="
docker exec "$APP" node -e "
fetch('http://127.0.0.1:3000/api/health')
  .then(r => r.text())
  .then(t => { try { console.log(JSON.stringify(JSON.parse(t), null, 2)); }
               catch { console.log(t); } })
  .catch(e => console.log('GAGAL: ' + e.message));
" 2>&1

echo ""
echo "===root :3000 raiz (apa yang dikembalikan) ==="
docker exec "$APP" node -e "
fetch('http://127.0.0.1:3000/', { redirect: 'manual' })
  .then(async r => console.log('  HTTP ' + r.status + ' -> ' + r.headers.get('location')))
  .catch(e => console.log('  GAGAL: ' + e.message));
" 2>&1