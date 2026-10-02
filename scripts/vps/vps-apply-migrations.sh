#!/bin/sh
# Jalankan migrasi Drizzle di VPS: 0010 (per bagian), lalu 0011-0013.
#
#   scp Task-Management-NovaCore/drizzle/00*.sql vps:/root/migrations/
#   ssh vps "cat /root/migrations/apply | sh"
#
# Semua file idempotent (IF EXISTS / IF NOT EXISTS).
# 0010 punya bagian 1 = laporan duplikat, bagian 2 = pasang constraint.
# Bagian 1 sudah dijalankan lebih dulu lewat vps-inspect dan hasilnya
# BERSIH, jadi di sini langsung bagian 2.
#
# Kalau dipanggil ulang, constraint yang sudah ada akan dilewati.
set -u

DB=vlu8rdt1abda7g69vbiwsk4p
MIG=/root/migrations

banner() {
  echo ""
  echo "############################################################"
  echo "# $1"
  echo "############################################################"
}

# Jalankan SQL lewat stdin supaya karakter kutip di file tidak
# melewati parser shell. -v ON_ERROR_STOP=1 supaya berhenti di error
# pertama, bukan melanjutkan ke baris berikutnya dengan state setengah.
run() {
  docker exec -i "$DB" psql -U postgres -d db_hr_system -v ON_ERROR_STOP=1
}

banner "STEP 1/4 - 0010 bagian 1: laporan duplikat (READ-ONLY, untuk Biden ulang)"
run < "$MIG/0010_unique_constraints.sql" 2>&1 | head -n 40
echo ""
echo ">> Lanjut ke bagian 2 HANYA kalau tidak ada baris 'nilai' terisi di atas."

banner "STEP 2/4 - 0010 bagian 2: pasang constraint UNIQUE"
# Bagian 2 dibungkus transaksi dan RAISE EXCEPTION kalau menemukan
# duplikat -- jadi kalau laporan di langkah 1 ternyata tidak bersih,
# langkah ini berhenti sendiri dan tidak meninggalkan constraint
# separuh jadi.
run < "$MIG/0010_unique_constraints.sql" 2>&1 | tail -n 40
echo ""
echo "-- constraint sekarang:"
docker exec "$DB" psql -U postgres -d db_hr_system -Atc \
  "SELECT conname FROM pg_constraint
    WHERE conname IN ('departments_name_unique','office_locations_name_unique',
                      'letter_types_code_unique','kpis_title_year_month_unique')
    ORDER BY 1;"

banner "STEP 3/4 - 0011 (kpis.brand) dan 0012 (feedbacks)"
run < "$MIG/0011_kpis_brand.sql"
echo ""
echo "--- 0012 bagian 1: laporan (READ-ONLY)"
run < "$MIG/0012_feedbacks.sql" 2>&1 | head -n 30
echo ""
echo "--- 0012 bagian 2: ubah + constraint"
run < "$MIG/0012_feedbacks.sql" 2>&1 | tail -n 45

banner "STEP 4/4 - 0013 (payrolls: deduction_notes + system_overtime_days)"
run < "$MIG/0013_payroll_columns.sql" 2>&1 | tail -n 25

banner "HASIL AKHIR - verifikasi semua kolom & constraint"
docker exec "$DB" psql -U postgres -d db_hr_system -c "
SELECT * FROM (
  SELECT '0011 kpis.brand' AS item,
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='kpis' AND column_name='brand') AS ok
  UNION ALL SELECT '0012 feedbacks.user_name',
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='feedbacks' AND column_name='user_name')
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

echo "-- constraint 0010:"
docker exec "$DB" psql -U postgres -d db_hr_system -Atc \
  "SELECT conname FROM pg_constraint
    WHERE conname IN ('departments_name_unique','office_locations_name_unique',
                      'letter_types_code_unique','kpis_title_year_month_unique')
    ORDER BY 1;"

echo "-- constraint 0012 (check):"
docker exec "$DB" psql -U postgres -d db_hr_system -Atc \
  "SELECT conname FROM pg_constraint
    WHERE conname IN ('feedbacks_type_check','feedbacks_status_check',
                      'feedbacks_user_name_nn','feedbacks_type_nn')
    ORDER BY 1;"

echo ""
echo "Selesai. Kalau semua kolom di atas 'ok = t' dan keempat constraint"
echo "0010 muncul, migrasi berhasil."