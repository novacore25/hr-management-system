#!/bin/sh
# Cek kesehatan produksi SETELAH migrasi.
#
# Dijalankan: ssh vps "cat /usr/local/bin/novacore-health | sh"
#
# PENTING: nama container aplikasi BUKAN tetap. Coolify menambahkan
# sufiks numerik yang berubah setiap deploy:
#   rredcbao7tqz34pkqeelf8xx-013850109242  (lama)
#   rredcbao7tqz34pkqeelf8xx-060636430958  (sekarang)
# Hardcode nama = "No such container" padahal aplikasinya sehat.
# Jadi skrip ini mencari berdasarkan prefiks.
#
# Fokus: memastikan migrasi tidak merusak aplikasi.
set -u

DB=vlu8rdt1abda7g69vbiwsk4p
PREFIX=rredcbao7tqz34pkqeelf8xx

echo "=== 1. Container aplikasi (dicari by prefiks, bukan hardcode) ==="
APP=$(docker ps --format '{{.Names}}' | grep "^${PREFIX}" | head -1)
if [ -z "$APP" ]; then
  echo "  TIDAK ADA container aktif dengan prefiks $PREFIX"
  docker ps --format '  {{.Names}}' | head -20
  exit 1
fi
docker ps --filter "name=$APP" --format '  {{.Names}}  {{.Status}}  {{.Image}}'

echo ""
echo "=== 2. Image tag = commit mana yang berjalan ==="
docker inspect "$APP" --format '{{.Config.Image}}' | sed 's/^/  /'
echo "  (bandingkan dengan: git log --oneline -1)"

echo ""
echo "=== 3. Health endpoint (lewat internal, app tidak publish port) ==="
docker exec "$APP" node -e "
const urls = ['/api/health', '/api/departments', '/api/kpis'];
(async () => {
  for (const u of urls) {
    try {
      const r = await fetch('http://127.0.0.1:3000' + u, { redirect: 'manual' });
      const t = await r.text();
      console.log('  ' + u.padEnd(22) + ' HTTP ' + r.status
        + '  ' + t.replace(/\s+/g, ' ').slice(0, 180));
    } catch (e) {
      console.log('  ' + u.padEnd(22) + ' GAGAL: ' + e.message);
    }
  }
})();
" 2>&1

echo ""
echo "=== 4. Error di log 30 menit terakhir ==="
ERRS=$(docker logs --since 30m "$APP" 2>&1 \
       | grep -iE 'error|fatal|exception|ECONNREFUSED' \
       | grep -viE '401|Unauthorized|GET /api/health' \
       | head -20)
if [ -z "$ERRS" ]; then
  echo "  (tidak ada)"
else
  echo "$ERRS" | sed 's/^/  /'
fi

echo ""
echo "=== 5. Log startup terakhir (untuk lihat versi yang aktif) ==="
docker logs --since 60m "$APP" 2>&1 | grep -iE 'ready|listen|version|commit' \
  | tail -5 | sed 's/^/  /'

echo ""
echo "=== 6. Constraint UNIQUE aktif ==="
docker exec "$DB" psql -U postgres -d db_hr_system -Atc \
  "SELECT conrelid::regclass::text || '.' || conname
     FROM pg_constraint
    WHERE contype = 'u'
      AND conrelid::regclass::text IN
          ('departments','office_locations','letter_types','kpis')
    ORDER BY 1;" | sed 's/^/  /'

echo ""
echo "=== 7. Data tidak berubah oleh migrasi ==="
docker exec "$DB" psql -U postgres -d db_hr_system -c \
  "SELECT 'departments' AS t, count(*) AS n FROM departments
   UNION ALL SELECT 'letter_types', count(*) FROM letter_types
   UNION ALL SELECT 'users', count(*) FROM users
   UNION ALL SELECT 'kpis', count(*) FROM kpis
   UNION ALL SELECT 'payrolls', count(*) FROM payrolls
   ORDER BY 1;"

echo ""
echo "=== 8. Kolom hasil migrasi ==="
docker exec "$DB" psql -U postgres -d db_hr_system -c \
  "SELECT table_name, column_name
     FROM information_schema.columns
    WHERE (table_name='kpis'      AND column_name='brand')
       OR (table_name='feedbacks' AND column_name IN ('user_name','type'))
       OR (table_name='payrolls'  AND column_name IN
             ('deduction_notes','system_overtime_days'))
    ORDER BY 1, 2;"