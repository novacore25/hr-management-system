#!/bin/sh
# Uji migrasi tanpa menyimpan apa pun.
#
# Berkas 0015 dijalankan apa adanya, hanya COMMIT terakhir yang diganti
# menjadi: cek jumlah baris per tabel, lalu ROLLBACK.
#
# Yang diperiksa di dalam transaksi yang sama, bukan setelahnya:
# Kalau migrasi benar, jumlah baris di setiap tabel tujuan sama dengan
# jumlah baris di _staging. Kalau tidak sama, itu baru ketahuan sekarang
# -- bukan setelah data produksi tertimpa.
set -u
DB=vlu8rdt1abda7g69vbiwsk4p
LOCAL=db_hr_system
ASLI=/root/migrations/0015_data_migration.sql
UJI=/tmp/0015-dryrun.sql

TABEL="departments office_locations letter_types users absensi_settings holidays kpis kpi_assignments kpi_settings kpi_histories daily_reports monthly_scores attendance leave_requests overtime_requests payroll_addition_types payroll_deduction_types payroll_staff_settings payrolls feedbacks absensi_logs company_letters department_locations"

echo "=== 1. Siapkan berkas uji (COMMIT -> cek + ROLLBACK) ==="
# Semua isi 0015 kecuali baris COMMIT terakhir, lalu pemeriksaan
# ditambahkan setelahnya dan transaksi ditutup dengan ROLLBACK.
sed '$d' "$ASLI" > "$UJI"
{
  echo ""
  echo "-- ============ PEMERIKSAAN DI DALAM TRANSAKSI ============"
  echo "WITH staging AS ("
  i=0
  for t in $TABEL; do
    i=$((i + 1))
    [ "$i" -gt 1 ] && echo "  UNION ALL"
    printf "  SELECT '%s' AS tabel, count(*)::bigint AS baris FROM _staging.%s" "$t" "$t"
  done
  echo ""
  echo "), tujuan AS ("
  i=0
  for t in $TABEL; do
    i=$((i + 1))
    [ "$i" -gt 1 ] && echo "  UNION ALL"
    printf "  SELECT '%s' AS tabel, count(*)::bigint AS baris FROM public.%s" "$t" "$t"
  done
  echo ""
  echo ")"
  echo "SELECT coalesce(s.tabel, d.tabel) AS tabel,"
  echo "       coalesce(s.baris, -1) AS baris_staging,"
  echo "       coalesce(d.baris, -1) AS baris_tujuan,"
  echo "       CASE WHEN s.baris = d.baris THEN 'SAMA' ELSE 'BEDA' END AS hasil"
  echo "  FROM staging s FULL JOIN tujuan d USING (tabel)"
  echo " ORDER BY 1;"
  echo ""
  echo "-- managed_departments harus berisi UUID, bukan nama"
  echo "SELECT name, managed_departments FROM public.users"
  echo " WHERE managed_departments IS NOT NULL AND managed_departments <> '[]'::jsonb"
  echo " ORDER BY name;"
  echo ""
  echo "ROLLBACK;"
} >> "$UJI"
echo "  COMMIT terakhir diganti jadi cek + ROLLBACK"
echo "  berkas uji: $UJI"

echo ""
echo "=== 2. Jalankan ( hasil SEHARUSNYA tidak disimpan ) ==="
docker exec -i "$DB" psql -U postgres -d "$LOCAL" -v ON_ERROR_STOP=1 \
  < "$UJI" > /tmp/dryrun.out 2>&1
RC=$?
sed 's/^/  /' /tmp/dryrun.out | head -45

echo ""
if [ "$RC" -ne 0 ]; then
  echo "=== GAGAL (kode $RC). Tidak ada yang tersimpan: transaksi sudah ROLLBACK ==="
  exit 1
fi

echo "=== 3. Hasil perbandingan ==="
sed -n '/PEMERIKSAAN DI DALAM TRANSAKSI/,/ROLLBACK/p' /tmp/dryrun.out \
  | grep -E '^\s+(departments|office_|letter_|users|absensi_|holidays|kpis|kpi_|daily_|monthly_|attendance|leave_|overtime_|payroll|feedbacks|company_|department_)' \
  | sed 's/^/  /'

echo ""
echo "=== 4. managed_departments setelah konversi ==="
grep -A4 'managed_departments harus' /tmp/dryrun.out | tail -5 | sed 's/^/  /'

echo ""
echo "=== 5. Pastikan benar-benar tidak ada yang tersimpan ==="
docker exec "$DB" psql -U postgres -d "$LOCAL" -c \
  "SELECT 'departments' AS tabel, count(*) FROM public.departments
   UNION ALL SELECT 'users', count(*) FROM public.users
   UNION ALL SELECT 'attendance', count(*) FROM public.attendance
   UNION ALL SELECT 'kpis', count(*) FROM public.kpis;" 2>&1 | sed 's/^/  /'
echo "  (kalau 0 semua, rollback-nya bekerja)"