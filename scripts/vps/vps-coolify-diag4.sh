#!/bin/sh
# Auto-deploy berjalan tapi selalu FAIL. Sekarang ambil log kegagalannya.
# Nama kolom diambil dari katalog: yang benar `logs`, bukan
# `application_deployment_logs` seperti yang ditebak versi sebelumnya.
set -u
U=$(docker exec coolify-db printenv POSTGRES_USER 2>/dev/null || echo coolify)
D=$(docker exec coolify-db printenv POSTGRES_DB 2>/dev/null || echo coolify)

cat > /tmp/f1.sh <<XEOF
set -u
echo "=== 1. 8 antrean deployment terakhir untuk aplikasi kita ==="
docker exec coolify-db psql -U "$U" -d "$D" -c \\
  "SELECT created_at, status, is_webhook, left(COALESCE(commit,''),9) AS commit,
          finished_at
     FROM application_deployment_queues
    WHERE application_name LIKE '%rredcbao%'
    ORDER BY created_at DESC LIMIT 8;" 2>&1 | sed 's/^/  /'
XEOF
cat /tmp/f1.sh | sh

cat > /tmp/f2.sh <<XEOF
set -u
echo ""
echo "=== 2. Baris terakhir dari log deployment yang GAGAL ==="
echo "    (200 baris terakhir dari log, dipangkas ke 190 karakter)"
docker exec coolify-db psql -U "$U" -d "$D" -Atc \\
  "SELECT logs FROM application_deployment_queues
    WHERE application_name LIKE '%rredcbao%' AND status = 'failed'
    ORDER BY created_at DESC LIMIT 1;" 2>&1 | tail -45 | cut -c1-190 | sed 's/^/  /'
XEOF
cat /tmp/f2.sh | sh

cat > /tmp/f3.sh <<XEOF
set -u
echo ""
echo "=== 3. Baris log yang paling sering menandai kegagalan ==="
docker exec coolify-db psql -U "$U" -d "$D" -Atc \\
  "SELECT logs FROM application_deployment_queues
    WHERE application_name LIKE '%rredcbao%' AND status = 'failed'
    ORDER BY created_at DESC LIMIT 3;" 2>&1 \\
  | grep -iE 'error|failed|denied|unauthorized|cannot|unable|exit code|not found|timeout|EOF' \\
  | sort | uniq -c | sort -rn | head -20 | cut -c1-180 | sed 's/^/  /'
XEOF
cat /tmp/f3.sh | sh

cat > /tmp/f4.sh <<XEOF
set -u
echo ""
echo "=== 4. Berapa kali gagal vs sukses, 3 hari terakhir ==="
docker exec coolify-db psql -U "$U" -d "$D" -c \\
  "SELECT application_name, status, count(*), min(created_at) AS pertama,
          max(created_at) AS terakhir
     FROM application_deployment_queues
    WHERE created_at > now() - interval '3 days'
    GROUP BY 1,2 ORDER BY 1,2;" 2>&1 | sed 's/^/  /'

echo ""
echo "=== 5. Kapan deployment terakhir yang SUKSES untuk aplikasi kita? ==="
docker exec coolify-db psql -U "$U" -d "$D" -c \\
  "SELECT status, created_at, left(COALESCE(commit,''),9) AS commit
     FROM application_deployment_queues
    WHERE application_name LIKE '%rredcbao%' AND status = 'successful'
    ORDER BY created_at DESC LIMIT 3;" 2>&1 | sed 's/^/  /'
XEOF
cat /tmp/f4.sh | sh