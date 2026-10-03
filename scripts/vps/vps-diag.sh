#!/bin/sh
# Diagnosis kenapa beberapa request dapat HTTP 000.
#
# Dua dugaan awal:
#   1. Coolify sedang redeploy karena ada push baru
#   2. Ada lebih dari satu container dengan prefiks yang sama
set -u
PREFIX=rredcbao7tqz34pkqeelf8xx

echo "=== 1. Semua container dengan prefiks itu (aktif DAN berhenti) ==="
docker ps -a --filter "name=$PREFIX" --format '  {{.Names}} | {{.Status}} | {{.Image}}'

echo ""
echo "=== 2. Container aktif, log 10 menit terakhir ==="
APP=$(docker ps --format '{{.Names}}' | grep "^$PREFIX" | head -1)
if [ -z "$APP" ]; then
  echo "  TIDAK ADA container aktif"
  exit 1
fi
echo "  dipakai: $APP"
docker logs --since 10m "$APP" 2>&1 | tail -20 | sed 's/^/  /'

echo ""
echo "=== 3. Ulangi health check 5 kali (untuk melihat intermitensi) ==="
i=1
while [ "$i" -le 5 ]; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 \
    "https://${PREFIX}.168.231.118.146.sslip.io/api/health")
  printf "  percobaan %s: HTTP %s (%ss)\n" "$i" "$code" \
    "$(curl -s -o /dev/null -w '%{time_total}' --max-time 30 \
       "https://${PREFIX}.168.231.118.146.sslip.io/api/health")"
  i=$((i + 1))
done

echo ""
echo "=== 4. Beban container (2 vCPU, jangan sampai overwhelmed) ==="
docker stats --no-stream --format '  CPU {{.CPUPerc}} | MEM {{.MemUsage}}' "$APP"

echo ""
echo "=== 5. Error di log sejak container start ==="
docker logs "$APP" 2>&1 | grep -icE 'error|fatal|exception' | sed 's/^/  jumlah baris error: /'