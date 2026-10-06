#!/bin/sh
# Apakah jalur cadangan benar-benar ter-deploy, bukan hanya "tidak error"?
#
# Sama seperti §3.2.2: build produksi minify nama fungsi, jadi cari
# LITERAL STRING dan nilai field -- bukan nama fungsi.
#
# Yang dicari:
#   - "mode cadangan"        : teks peringatan di halaman approvals
#   - "tidak ada HR aktif"   : pesan penolakan dari DAL
#   - "leave_approved_hr_by_executive_fallback" : action di audit log
#   - "sudah berstatus"       : pesan 400 dari route (tahap dari status)
#
# Semuanya string, jadi tahan minify.

set -u
APP=$(docker ps --format '{{.Names}}' | grep '^rredcbao7tqz34pkqeelf8xx' | head -1)
if [ -z "$APP" ]; then
  echo "tidak ada container aplikasi"
  exit 1
fi
DB=$(docker ps --format '{{.Names}}' | grep '^vlu8rdt1abda7g69vbiwsk4p$' | head -1)

echo "=== 0. Konteks ==="
echo "  app : $APP"
docker inspect "$APP" --format '  image={{.Config.Image}}' 2>/dev/null

echo ""
echo "=== 1. String jalur cadangan di dalam bundle .next ==="
for S in "mode cadangan" "tidak ada HR aktif" "leave_approved_hr_by_executive_fallback" "sudah berstatus"; do
  N=$(docker exec "$APP" sh -c "grep -rl '$S' /app/.next 2>/dev/null | wc -l" 2>/dev/null | tr -d ' ')
  if [ "${N:-0}" -gt 0 ]; then
    echo "  ADA    ($N file)  $S"
  else
    echo "  TIDAK ADA         $S"
  fi
done

echo ""
echo "  Bandingkan: 'decideLeaveStage' TIDAK akan ditemukan, karena nama"
echo "  fungsi di-minify. Itu normal, bukan tanda kode tidak ikut ter-deploy."

echo ""
echo "=== 2. Apakah tabel absensi_logs bisa menampung action fallback? ==="
echo "  Kolom action bebas teks, jadi tidak perlu migrasi. Tapi dicek"
echo "  bahwa tabelnya ada dan punya kolom yang dipakai writeLog:"
if [ -n "$DB" ]; then
  docker exec "$DB" psql -U postgres -d db_hr_system -c \
    "SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='absensi_logs'
        AND column_name IN ('actor','action','target_user_id','details','created_at')
      ORDER BY ordinal_position;" 2>&1 | sed 's/^/  /'
  echo "  action yang sudah dipakai (5 terakhir):"
  docker exec "$DB" psql -U postgres -d db_hr_system -Atc \
    "SELECT '    ' || action FROM public.absensi_logs
      GROUP BY action ORDER BY max(created_at) DESC LIMIT 5;" 2>&1
else
  echo "  container postgres tidak ditemukan"
fi