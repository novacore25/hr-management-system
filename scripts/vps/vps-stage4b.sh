#!/bin/sh
# Dua hal yang harus dipastikan sebelum menulis INSERT transformasi.
#
# 1. numeric -> integer
#    Casting numeric ke integer di PostgreSQL MEMBULATKAN, bukan
#    menolak. Kalau ada satu saja nilai 4.5 di working_days_total,
#    hasil migrasi akan terlihat masuk akal (jadi 4 atau 5) dan siapa pun
#    akan pernah tahu ada data yang berubah. Jadi pecahan harus dicek
#    lebih dulu, dan harus GAGAL kalau ada -- bukan dibulatkan diam-diam.
#
# 2. Kolom yang hanya ada di tujuan
#    Kalau salah satunya NOT NULL tanpa DEFAULT, INSERT akan gagal
#    padahal semua dataanya ada. Perlu diketahui sekarang.
set -u
DB=vlu8rdt1abda7g69vbiwsk4p
LOCAL=db_hr_system

echo "=== 1. Ada pecahan di kolom yang akan jadi integer? ==="
BEKU="kpi_assignments.active_days kpi_assignments.working_days_elapsed kpi_assignments.working_days_remaining kpi_assignments.working_days_total kpi_settings.activity_weight kpi_settings.hr_weight kpi_settings.lead_tim_weight kpi_settings.quality_weight kpi_settings.result_weight"
ADA_PECAHAN=0
for item in $BEKU; do
  tbl=${item%%.*}
  col=${item##*.}
  n=$(docker exec "$DB" psql -U postgres -d "$LOCAL" -Atc \
    "SELECT count(*) FROM _staging.\"$tbl\" WHERE \"$col\" IS NOT NULL AND \"$col\" <> trunc(\"$col\"::numeric);")
  printf "  %-34s nilai berpecahan: %s\n" "$item" "$n"
  if [ "$n" != "0" ]; then
    ADA_PECAHAN=$((ADA_PECAHAN + 1))
    docker exec "$DB" psql -U postgres -d "$LOCAL" -c \
      "SELECT DISTINCT \"$col\" FROM _staging.\"$tbl\" WHERE \"$col\" <> trunc(\"$col\"::numeric) ORDER BY 1;" 2>&1 | head -8 | sed 's/^/      /'
  fi
done
echo ""
if [ "$ADA_PECAHAN" -eq 0 ]; then
  echo "  semua nilai bulat. Casting ke integer tidak mengubah apa pun."
else
  echo "  ADA PECAHAN pada $ADA_PECAHAN kolom. Jangan dilanjutkan."
fi

echo ""
echo "=== 2. Kolom HANYA DI TUJUAN, beserta nullable dan default ==="
docker exec "$DB" psql -U postgres -d "$LOCAL" -c "
WITH s AS (
  SELECT table_name, column_name FROM information_schema.columns
   WHERE table_schema='_staging'
), p AS (
  SELECT table_name, column_name, is_nullable, column_default
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name IN (SELECT table_name FROM s)
)
SELECT p.table_name, p.column_name,
       CASE WHEN p.is_nullable='YES' THEN 'boleh NULL' ELSE 'WAJIB ADA' END AS syarat,
       coalesce(p.column_default, '(tanpa default)') AS default
  FROM p LEFT JOIN s USING (table_name, column_name)
 WHERE s.column_name IS NULL ORDER BY 1,3,2;" 2>&1

echo ""
echo "=== 3. managed_departments di staging (harus diubah ke UUID) ==="
docker exec "$DB" psql -U postgres -d "$LOCAL" -c \
  "SELECT id, name, managed_departments FROM _staging.users
    WHERE managed_departments IS NOT NULL AND cardinality(managed_departments) > 0
    ORDER BY name;" 2>&1
echo "  divisi yang tersedia:"
docker exec "$DB" psql -U postgres -d "$LOCAL" -c \
  "SELECT id, name FROM _staging.departments ORDER BY name;" 2>&1

echo ""
echo "=== 4. Semua nilai enum di staging ada di enum tujuan? ==="
PASANGAN="attendance.late_reason_status:attendance.late_reason_status attendance.status:attendance_status attendance.type:attendance_type kpi_assignments.performance_category:performance_category kpi_assignments.status:assignment_status kpis.period:kpi_period kpis.type:kpi_type kpis.unit:kpi_unit leave_requests.status:leave_status leave_requests.type:leave_type payroll_staff_settings.company:company payrolls.snapshot_company:company"
for item in $PASANGAN; do
  src=${item%%:*}
  dst=${item##*:}
  tbl=${src%%.*}
  col=${src##*.}
  nilai=$(docker exec "$DB" psql -U postgres -d "$LOCAL" -Atc \
    "SELECT coalesce(string_agg(DISTINCT \"$col\", ', '), '(kosong)') FROM _staging.\"$tbl\";")
  hilang=$(docker exec "$DB" psql -U postgres -d "$LOCAL" -Atc \
    "SELECT count(*) FROM (SELECT DISTINCT \"$col\" AS v FROM _staging.\"$tbl\") x
      WHERE v IS NOT NULL AND NOT EXISTS
        (SELECT 1 FROM pg_enum e JOIN pg_type ty ON ty.oid=e.enumtypid
          WHERE ty.typname='$dst' AND e.enumlabel = x.v);")
  printf "  %-34s -> %-22s ada_terdaftar: %s\n" "$src" "$dst" "$nilai"
  if [ "$hilang" = "0" ]; then
    printf "  %-34s    semua nilai terdaftar\n" ""
  else
    printf "  %-34s    PERINGATAN: %s nilai tidak terdaftar\n" "" "$hilang"
  fi
done