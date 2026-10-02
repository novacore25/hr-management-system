#!/bin/sh
# Verifikasi PASCA-migrasi: pastikan constraint & kolom benar-benar ada
# dan tidak ada data yang rusak.
#
# Dijalankan: ssh vps "cat /usr/local/bin/novacore-verify | sh"
set -u

DB=vlu8rdt1abda7g69vbiwsk4p
PSQL="docker exec $DB psql -U postgres -d db_hr_system"

echo "=== A. Semua constraint unik & check di tabel yang disentuh 0010/0012 ==="
$PSQL -c "SELECT conrelid::regclass::text AS tabel, conname, contype
          FROM pg_constraint
          WHERE conrelid::regclass::text IN
                ('departments','office_locations','letter_types','kpis','feedbacks')
            AND contype IN ('u','c','n')
          ORDER BY 1, 2;"

echo ""
echo "=== B. Kolom hasil migrasi 0011-0013 ==="
$PSQL -c "SELECT table_name, column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE (table_name='kpis'      AND column_name='brand')
             OR (table_name='feedbacks' AND column_name IN ('user_name','department','role','type'))
             OR (table_name='payrolls'  AND column_name IN ('deduction_notes','system_overtime_days'))
          ORDER BY 1, 2;"

echo ""
echo "=== C. Data tidak boleh berubah ==="
$PSQL -c "SELECT 'departments' AS t, count(*) AS n FROM departments
          UNION ALL SELECT 'letter_types', count(*) FROM letter_types
          UNION ALL SELECT 'users', count(*) FROM users
          UNION ALL SELECT 'kpis', count(*) FROM kpis
          UNION ALL SELECT 'feedbacks', count(*) FROM feedbacks
          UNION ALL SELECT 'payrolls', count(*) FROM payrolls
          ORDER BY 1;"

echo ""
echo "=== D. Sanity: constraint UNIQUE benar-benar bekerja ==="
echo "--- coba insert divisi duplikat (harus GAGAL, lalu di-rollback):"
docker exec -i "$DB" psql -U postgres -d db_hr_system <<'SQL'
BEGIN;
INSERT INTO departments (name) VALUES ('TNT');
ROLLBACK;
SQL

echo ""
echo "=== E. Nama constraint 0010 yang sebenarnya ==="
echo "(CATATAN: nama di DB adalah kpis_title_period_unique, bukan"
echo " kpis_title_year_month_unique -- dokumentasi lama salah menyebutnya."
echo " Verifikasi yang salah nama akan melaporkan constraint hilang"
echo " padahal sebenarnya ada.)"
$PSQL -Atc "SELECT conname FROM pg_constraint
            WHERE conrelid = 'kpis'::regclass AND contype = 'u';"

echo ""
echo "=== F. Golongan huruf untuk Info Letters ==="
echo "(0008 menambah kolom prefix/suffix; Status.md sempat menyebutnya"
echo " belum ada. Cek sebenarnya:)"
$PSQL -c "SELECT column_name, data_type FROM information_schema.columns
          WHERE table_name='letter_types' ORDER BY ordinal_position;"