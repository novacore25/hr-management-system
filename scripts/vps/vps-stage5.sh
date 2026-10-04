#!/bin/sh
# Dua hal yang menghalangi migrasi dan harus diputuskan lebih dulu.
#
# 1. attendance.late_reason_status punya nilai accepted, pending,
#    rejected di data Supabase, tapi tidak ada di enum produksi kita.
#    Kalau dipaksa, INSERT akan gagal dengan "invalid input value for
#    enum" -- dan itu memang lebih baik daripada diam-diam memotong.
#
# 2. kpi_assignments.kpi_type adalah NOT NULL tanpa default dan tidak
#    ada di Supabase. Jadi harus diisi dari suatu sumber.
set -u
DB=vlu8rdt1abda7g69vbiwsk4p
LOCAL=db_hr_system

echo "=== 1. Isi enum late_reason_status di produksi ==="
docker exec "$DB" psql -U postgres -d "$LOCAL" -c \
  "SELECT e.enumlabel, e.enumsortorder FROM pg_enum e
     JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'late_reason_status' ORDER BY e.enumsortorder;" 2>&1

echo "  berapa baris attendance terpengaruh per nilai:"
docker exec "$DB" psql -U postgres -d "$LOCAL" -c \
  "SELECT coalesce(late_reason_status,'(NULL)') AS nilai, count(*) AS baris
     FROM _staging.attendance GROUP BY 1 ORDER BY 2 DESC;" 2>&1

echo ""
echo "=== 2. Seberapa sering late_reason_status dipakai di data lain? ==="
docker exec "$DB" psql -U postgres -d "$LOCAL" -c \
  "SELECT count(*) FILTER (WHERE late_reason IS NOT NULL AND late_reason <> '') AS ada_alasan,
          count(*) FILTER (WHERE late_reason_status IS NOT NULL) AS ada_status,
          count(*) AS total
     FROM _staging.attendance;" 2>&1

echo ""
echo "=== 3. Kolom kpi_type di kpi_assignments (tujuan) ==="
docker exec "$DB" psql -U postgres -d "$LOCAL" -c \
  "SELECT column_name, data_type, udt_name, is_nullable, column_default
     FROM information_schema.columns
    WHERE table_schema='public' AND table_name='kpi_assignments'
      AND column_name = 'kpi_type';" 2>&1

echo ""
echo "  apakah kpis punya kolom type yang bisa dipakai sebagai sumber?"
docker exec "$DB" psql -U postgres -d "$LOCAL" -c \
  "SELECT k.type, count(*) AS jumlah_kpi FROM _staging.kpis k GROUP BY 1 ORDER BY 1;" 2>&1

echo ""
echo "  berapa assignment yangkpunya KPI, dan apakah type-nya bisa diturunkan?"
docker exec "$DB" psql -U postgres -d "$LOCAL" -c \
  "SELECT k.type, count(*) AS jumlah_assignment
     FROM _staging.kpi_assignments a
     JOIN _staging.kpis k ON k.id = a.kpi_id
    GROUP BY 1 ORDER BY 1;" 2>&1

echo ""
echo "  assignment yang tidak punya kpi_id atau kpi-nya tidak ada:"
docker exec "$DB" psql -U postgres -d "$LOCAL" -c \
  "SELECT count(*) FILTER (WHERE a.kpi_id IS NULL) AS tanpa_kpi_id,
          count(*) FILTER (WHERE a.kpi_id IS NOT NULL AND k.id IS NULL) AS kpi_hilang,
          count(*) AS total
     FROM _staging.kpi_assignments a
     LEFT JOIN _staging.kpis k ON k.id = a.kpi_id;" 2>&1