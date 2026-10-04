#!/bin/sh
# Pantau antrean deployment Coolify untuk aplikasi kita.
#
# Dipakai setelah resolver diperbaiki, untuk membuktikan build yang
# tadinya selalu gagal sekarang benar-benar berhasil -- dan bukan
# hanya "tidak ada error lagi" (AGENTS.md 2.1).
#
# Cara pakai:
#   cat /usr/local/bin/novacore-pantau-deploy | sh -s <jumlah-detik>

set -u
U=$(docker exec coolify-db printenv POSTGRES_USER 2>/dev/null || echo coolify)
D=$(docker exec coolify-db printenv POSTGRES_DB 2>/dev/null || echo coolify)
NAMA_APLIKASI="hr-management-system"
DETIK="${1:-120}"

echo "=== 1. Keadaan SEBELUM dipantau ==="
docker exec coolify-db psql -U "$U" -d "$D" -c \
  "SELECT created_at, status, left(COALESCE(commit,''),9) AS commit
     FROM application_deployment_queues
    WHERE application_name LIKE '%rredcbao%'
    ORDER BY created_at DESC LIMIT 3;" 2>&1 | sed 's/^/  /'

echo ""
echo "=== 2. Status container aplikasi sekarang ==="
APP=$(docker ps --format '{{.Names}}' | grep '^rredcbao7tqz34pkqeelf8xx' | head -1)
if [ -n "$APP" ]; then
  docker inspect "$APP" --format '  {{.Name}}  image={{.Config.Image}}  started={{.State.StartedAt}}' | sed 's/^/  /'
else
  echo "  tidak ada container aktif"
fi

echo ""
echo "=== 3. Memantau $DETIK detik ==="
i=0
while [ "$i" -lt "$DETIK" ]; do
  BARIS=$(docker exec coolify-db psql -U "$U" -d "$D" -Atc \
    "SELECT created_at || ' | ' || status || ' | ' || left(COALESCE(commit,''),9)
       FROM application_deployment_queues
      WHERE application_name LIKE '%rredcbao%'
      ORDER BY created_at DESC LIMIT 1;" 2>/dev/null)
  echo "  [$(date +%H:%M:%S)] $BARIS"
  # Berhenti begitu ada entri baru yang selesai atau gagal.
  KASUS=$(echo "$BARIS" | cut -d'|' -f2 | tr -d ' ')
  if [ "$KASUS" = "finished" ] || [ "$KASUS" = "failed" ]; then
    echo ""
    echo "  deployment terakhir: $KASUS"
    break
  fi
  sleep 10
  i=$((i + 10))
done

echo ""
echo "=== 4. Status container SETELAH dipantau ==="
APP2=$(docker ps --format '{{.Names}}' | grep '^rredcbao7tqz34pkqeelf8xx' | head -1)
if [ -n "$APP2" ]; then
  docker inspect "$APP2" --format '  {{.Name}}  image={{.Config.Image}}  started={{.State.StartedAt}}  restart={{.RestartCount}}' | sed 's/^/  /'
else
  echo "  TIDAK ADA container aktif"
fi

echo ""
echo "=== 5. Jejak 6 deployment terakhir ==="
docker exec coolify-db psql -U "$U" -d "$D" -c \
  "SELECT created_at, status, left(COALESCE(commit,''),9) AS commit, finished_at
     FROM application_deployment_queues
    WHERE application_name LIKE '%rredcbao%'
    ORDER BY created_at DESC LIMIT 6;" 2>&1 | sed 's/^/  /'