#!/bin/sh
# Auto-deploy berjalan tapi selalu FAIL. Semua yang penting ada di
# sini: alasan gagalnya, dan sejak kapan.
set -u

cat > /tmp/d1.sh <<'XEOF'
set -u
echo "=== 1. Error di sekitar deployment terakhir ==="
docker logs --since 3h coolify 2>&1 \
  | grep -viE 'ApplicationDeploymentJob \.+ (RUNNING|DONE)' \
  | tail -40 | cut -c1-200 | sed 's/^/  /'
XEOF
cat /tmp/d1.sh | sh

echo ""
echo "=== 2. Kredensial database Coolify ==="
cat > /tmp/d2.sh <<'XEOF'
set -u
docker exec coolify-db env 2>&1 | grep -iE 'postgres|db_|user' | sed 's/=.*/=<disembunyikan>/' | sed 's/^/  /'
XEOF
cat /tmp/d2.sh | sh

echo ""
echo "=== 3. Koneksi ke database Coolify ==="
cat > /tmp/d3.sh <<'XEOF'
set -u
U=$(docker exec coolify-db printenv POSTGRES_USER 2>/dev/null || echo "")
D=$(docker exec coolify-db printenv POSTGRES_DB 2>/dev/null || echo "")
echo "  user: ${U:-?}  database: ${D:-?}"
if [ -z "$U" ]; then
  echo "  POSTGRES_USER tidak ada; mencoba daftar database:"
  docker exec coolify-db psql -U coolify -d coolify -Atc "SELECT current_database();" 2>&1 | sed 's/^/    /'
  U=coolify; D=coolify
fi
docker exec coolify-db psql -U "$U" -d "$D" -Atc "SELECT count(*) FROM pg_tables WHERE schemaname='public';" 2>&1 | sed 's/^/  jumlah tabel: /'
XEOF
cat /tmp/d3.sh | sh

echo ""
echo "=== 4. Sumber daya dan setting auto-deploy ==="
cat > /tmp/d4.sh <<'XEOF'
set -u
U=$(docker exec coolify-db printenv POSTGRES_USER 2>/dev/null || echo coolify)
D=$(docker exec coolify-db printenv POSTGRES_DB 2>/dev/null || echo coolify)
docker exec coolify-db psql -U "$U" -d "$D" -c \
  "SELECT name, build_pack, auto_deploy, created_at, updated_at
     FROM applications ORDER BY created_at;" 2>&1 | sed 's/^/  /'
XEOF
cat /tmp/d4.sh | sh

echo ""
echo "=== 5. Riwayat deployment terakhir untuk aplikasi kita ==="
cat > /tmp/d5.sh <<'XEOF'
set -u
U=$(docker exec coolify-db printenv POSTGRES_USER 2>/dev/null || echo coolify)
D=$(docker exec coolify-db printenv POSTGRES_DB 2>/dev/null || echo coolify)
docker exec coolify-db psql -U "$U" -d "$D" -c \
  "SELECT d.created_at, d.status,
          left(COALESCE(d.logs,''), 300) AS cuplikan_log
     FROM deployments d
     JOIN applications a ON a.id = d.application_id
    WHERE a.name LIKE 'rredcbao%'
    ORDER BY d.created_at DESC
    LIMIT 4;" 2>&1 | sed 's/^/  /'
XEOF
cat /tmp/d5.sh | sh