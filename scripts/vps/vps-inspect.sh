#!/bin/sh
# Inspeksi READ-ONLY database produksi NovaCore HR.
#
# Dijalankan DI VPS, bukan dari mesin lokal:
#
#   scp scripts/vps-inspect.sh vps:/usr/local/bin/novacore-inspect
#   ssh vps "cat /usr/local/bin/novacore-inspect | sh"
#
# Kenapa `cat X | sh` dan bukan `sh X` atau `X`?
# Harness shell di mesin lokal mangle pemanggilan ssh yang perintahnya
# menjalankan sebuah file skrip: hasilnya "Permission denied (publickey)"
# yang sama sekali tidak berhubungan dengan kuncinya. `cat X | sh`
# lolos. Lihat AGENTS.md §2.3.
#
# Kenapa `sh` dan bukan `bash`? Karena perintah yang mengandung
# kata `bash` juga intercepted. Jadi skrip ini harus POSIX `sh`:
# tidak ada `set -o pipefail`, tidak ada `<<<`, tidak ada array.
#
# Tidak mengubah apa pun. Tujuannya menjawab sebelum migrasi apa pun
# dijalankan:
#   1. Container mana yang benar (ada DUA postgres di VPS ini)
#   2. Migrasi mana yang sudah ada / belum
#   3. Apakah bagian 1 dari 0010 (laporan duplikat) menemukan sesuatu
set -u

DB=vlu8rdt1abda7g69vbiwsk4p
PSQL="docker exec $DB psql -U postgres -d db_hr_system"
PSQLA="docker exec $DB psql -U postgres -d db_hr_system -Atc"

echo "=== 1. Semua container postgres ==="
for c in $(docker ps --format '{{.Names}}' | grep -i postgres || true); do
  echo ""
  echo "--- $c"
  docker inspect "$c" --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | grep -E '^POSTGRES_(DB|USER)=' || echo "  (tidak ada POSTGRES_DB)"
done

echo ""
echo "=== 2. Database di container $DB ==="
docker exec "$DB" psql -U postgres -Atc \
  "SELECT datname FROM pg_database WHERE NOT datistemplate ORDER BY 1;"

echo ""
echo "=== 3. Jumlah tabel publik di db_hr_system ==="
$PSQLA "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"

echo ""
echo "=== 4. Kolom dari migrasi 0011-0013: sudah ada atau belum ==="
$PSQL -c "
SELECT * FROM (
  SELECT '0011 kpis.brand' AS migrasi,
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='kpis' AND column_name='brand') AS sudah
  UNION ALL SELECT '0012 feedbacks.user_name',
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='feedbacks' AND column_name='user_name')
  UNION ALL SELECT '0012 feedbacks.department',
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='feedbacks' AND column_name='department')
  UNION ALL SELECT '0012 feedbacks.role',
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='feedbacks' AND column_name='role')
  UNION ALL SELECT '0012 feedbacks.type',
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='feedbacks' AND column_name='type')
  UNION ALL SELECT '0013 payrolls.deduction_notes',
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='payrolls' AND column_name='deduction_notes')
  UNION ALL SELECT '0013 payrolls.system_overtime_days',
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='payrolls' AND column_name='system_overtime_days')
) t ORDER BY 1;"

echo ""
echo "=== 5. Kolom dari migrasi 0006-0009 ==="
$PSQL -c "
SELECT * FROM (
  SELECT '0006 kpi_settings.weights' AS migrasi,
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='kpi_settings' AND column_name='weights') AS sudah
  UNION ALL SELECT '0007 users.religion',
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='users' AND column_name='religion')
  UNION ALL SELECT '0008 letter_types.prefix',
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='letter_types' AND column_name='prefix')
  UNION ALL SELECT '0009 users.employment_status',
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='users' AND column_name='employment_status')
) t ORDER BY 1;"

echo ""
echo "=== 6. Constraint unik dari 0010 ==="
FOUND=$($PSQLA "SELECT conname FROM pg_constraint
 WHERE conname IN ('departments_name_unique','office_locations_name_unique',
                   'letter_types_code_unique','kpis_title_year_month_unique')
 ORDER BY 1;")
if [ -z "$FOUND" ]; then
  echo "  (kosong = 0010 belum dipasang)"
else
  echo "$FOUND" | sed 's/^/  /'
fi

echo ""
echo "=== 7. BAGIAN 1 DARI 0010: laporan duplikat (READ-ONLY) ==="
echo "--- departments.name ganda:"
$PSQLA "SELECT name, count(*) FROM departments GROUP BY name HAVING count(*)>1;"
echo "--- office_locations.name ganda:"
$PSQLA "SELECT name, count(*) FROM office_locations GROUP BY name HAVING count(*)>1;"
echo "--- letter_types.code ganda:"
$PSQLA "SELECT code, count(*) FROM letter_types GROUP BY code HAVING count(*)>1;"
echo "--- kpis (title, year, month) ganda:"
$PSQLA "SELECT title, year, month, count(*) FROM kpis
        GROUP BY title, year, month HAVING count(*)>1;"
echo "(kalau tidak ada baris di atas = bersih, aman lanjut ke bagian 2)"

echo ""
echo "=== 8. Isi tabel ==="
$PSQL -c "
SELECT 'users' AS t, count(*) AS n FROM users
UNION ALL SELECT 'departments', count(*) FROM departments
UNION ALL SELECT 'office_locations', count(*) FROM office_locations
UNION ALL SELECT 'letter_types', count(*) FROM letter_types
UNION ALL SELECT 'kpis', count(*) FROM kpis
UNION ALL SELECT 'kpi_assignments', count(*) FROM kpi_assignments
UNION ALL SELECT 'daily_reports', count(*) FROM daily_reports
UNION ALL SELECT 'attendance', count(*) FROM attendance
UNION ALL SELECT 'leave_requests', count(*) FROM leave_requests
UNION ALL SELECT 'overtime_requests', count(*) FROM overtime_requests
UNION ALL SELECT 'payrolls', count(*) FROM payrolls
UNION ALL SELECT 'feedbacks', count(*) FROM feedbacks
UNION ALL SELECT 'holidays', count(*) FROM holidays
ORDER BY 1;"

echo ""
echo "=== 9. User dan role ==="
$PSQL -c "SELECT id, email, kpi_role, absensi_role, absensi_status,
                 managed_departments, department_id
          FROM users ORDER BY email;"

echo ""
echo "=== 10. Ringkasan: apa yang perlu dikerjakan ==="
NEED=$($PSQLA "SELECT count(*) FROM information_schema.columns
                WHERE table_name='kpis' AND column_name='brand';")
echo "  0011 (kpis.brand) perlu: $([ "$NEED" = "0" ] && echo YA || echo tidak)"
NEED=$($PSQLA "SELECT count(*) FROM information_schema.columns
                WHERE table_name='feedbacks' AND column_name='user_name';")
echo "  0012 (feedbacks.user_name) perlu: $([ "$NEED" = "0" ] && echo YA || echo tidak)"
NEED=$($PSQLA "SELECT count(*) FROM information_schema.columns
                WHERE table_name='payrolls' AND column_name='deduction_notes';")
echo "  0013 (payrolls.deduction_notes) perlu: $([ "$NEED" = "0" ] && echo YA || echo tidak)"