#!/bin/sh
# Periksa bentuk data Supabase SEBELUM migrasi. READ-ONLY.
#
# Tujuannya bukan memindahkan apa pun, tapi mencari hal-hal yang akan
 # menggigit saat load -- terutama yang sudah jadi temuan:
#
#  1. managed_departments berisi UUID atau NAMA divisi?
#  2. Ada duplikat yang akan melanggar constraint UNIQUE dari 0010?
#  3. Ada kolom di Supabase yang tidak ada di skema kita? (data hilang diam-diam)
 #  4. Foreign key yang menggantung (baris yatim)?
#  5. Kolom yang nilainya selalu 0 (mis. working_days_elapsed)?
#
# Dijalankan: ssh vps "cat /usr/local/bin/novacore-supabase-audit | sh"
set -u

ENVF=/root/.supabase-pg.env
OUT=/tmp/supabase-audit.txt

if [ ! -f "$ENVF" ]; then
  echo "ERROR: $ENVF tidak ada" >&2
  exit 1
fi

. "$ENVF"

PGC=vlu8rdt1abda7g69vbiwsk4p

# Fungsi helper: kirim SQL ke Supabase lewat psql di dalam container.
# Password lewat environment container, bukan argumen -- supaya tidak
# muncul di daftar proses dan tidak ikut ter-log.
sb() {
  docker exec -e PGPASSWORD="$SUPABASE_PG_PASSWORD" \
    "$PGC" psql \
      -h "$SUPABASE_PG_HOST" -p "$SUPABASE_PG_PORT" \
      -U "$SUPABASE_PG_USER" -d "$SUPABASE_PG_DB" \
      -v ON_ERROR_STOP=1 -Atc "$1"
}

{
echo "=== 0. Koneksi ==="
sb "SELECT current_database() || ' | versi ' || version();"

echo ""
echo "=== 1. managed_departments: UUID atau NAMA? ==="
echo "--- contoh nilai (maks 8):"
sb "SELECT coalesce(managed_departments::text, '(null)') || '  x' || count(*)
      FROM users GROUP BY managed_departments ORDER BY 2 DESC LIMIT 8;"
echo "--- apakah isinya valid UUID?"
sb "SELECT
      CASE
        WHEN managed_departments IS NULL THEN 'null'
        WHEN managed_departments ~ '^[0-9a-fA-F-]{36}$' THEN 'UUID'
        ELSE 'BUKAN UUID'
      END AS bentuk, count(*)
    FROM users GROUP BY 1 ORDER BY 2 DESC;"

echo ""
echo "=== 2. Duplikat yang akan melanggar UNIQUE dari migrasi 0010 ==="
for spec in \
  "departments.name" \
  "office_locations.name" \
  "letter_types.code"
do
  t=${spec%%.*}
  c=${spec##*.}
  n=$(sb "SELECT count(*) FROM (SELECT $c FROM $t GROUP BY $c HAVING count(*)>1) x;")
  if [ "$n" = "0" ]; then
    echo "  OK   $spec tidak ada duplikat"
  else
    echo "  BAHAYA $spec ada $n nilai duplikat:"
    sb "SELECT '    ' || $c || ' x' || count(*) FROM $t
          GROUP BY $c HAVING count(*)>1 ORDER BY $c;"
  fi
done
n=$(sb "SELECT count(*) FROM (SELECT title,year,month FROM kpis
        GROUP BY title,year,month HAVING count(*)>1) x;")
if [ "$n" = "0" ]; then
  echo "  OK   kpis(title,year,month) tidak ada duplikat"
else
  echo "  BAHAYA kpis(title,year,month) ada $n duplikat:"
  sb "SELECT '    ' || title || ' | ' || year || '-' || lpad(month::text,2,'0')
              || ' x' || count(*) FROM kpis
        GROUP BY title,year,month HAVING count(*)>1 ORDER BY title;"
fi

echo ""
echo "=== 3. Jumlah baris per tabel ==="
sb "SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name;" \
| while read -r t; do
    c=$(sb "SELECT count(*) FROM \"$t\";")
    printf "  %-26s %s\n" "$t" "$c"
  done

echo ""
echo "=== 4. Kolom yang kita baca tapi mungkin tidak ada di Supabase ==="
for spec in \
  "kpis:brand" \
  "feedbacks:user_name" \
  "feedbacks:department" \
  "feedbacks:role" \
  "feedbacks:type" \
  "payrolls:deduction_notes" \
  "payrolls:system_overtime_days" \
  "users:religion" \
  "users:employment_status" \
  "letter_types:template_url" \
  "kpi_assignments:working_days_elapsed" \
  "kpi_assignments:notes" \
  "attendance:check_in" \
  "attendance:check_out"
do
  t=${spec%%:*}
  c=${spec##*:}
  x=$(sb "SELECT count(*) FROM information_schema.columns
          WHERE table_schema='public' AND table_name='$t' AND column_name='$c';")
  if [ "$x" = "0" ]; then
    echo "  TIDAK ADA  $t.$c"
  else
    echo "  ada       $t.$c"
  fi
done

echo ""
echo "=== 5. FKey yang menggantung (baris yatim) ==="
for spec in \
  "kpi_assignments:user_id:users:id" \
  "kpi_assignments:kpi_id:kpis:id" \
  "daily_reports:assignment_id:kpi_assignments:id" \
  "daily_reports:user_id:users:id" \
  "attendance:user_id:users:id" \
  "leave_requests:user_id:users:id" \
  "overtime_requests:user_id:users:id" \
  "overtime_requests:approver_by:users:id" \
  "payrolls:user_id:users:id" \
  "feedbacks:user_id:users:id" \
  "kpi_settings:user_id:users:id" \
  "department_locations:department_id:departments:id" \
  "department_locations:location_id:office_locations:id" \
  "company_letters:letter_type_id:letter_types:id"
do
  child=$(echo "$spec" | cut -d: -f1)
  col=$(echo "$spec" | cut -d: -f2)
  parent=$(echo "$spec" | cut -d: -f3)
  pcol=$(echo "$spec" | cut -d: -f4)

  # Cek kolomnya ada dulu; kalau tidak, bukan yatim -- cuma beda skema.
  has=$(sb "SELECT count(*) FROM information_schema.columns
            WHERE table_schema='public' AND table_name='$child'
              AND column_name='$col';")
  if [ "$has" = "0" ]; then
    echo "  lewati     $child.$col (kolom tidak ada di Supabase)"
    continue
  fi

  n=$(sb "SELECT count(*) FROM \"$child\" c
        LEFT JOIN \"$parent\" p ON c.$col = p.$pcol
       WHERE c.$col IS NOT NULL AND p.$pcol IS NULL;")
  if [ "$n" = "0" ]; then
    echo "  OK         $child.$col -> $parent.$pcol"
  else
    echo "  YATIM $n  $child.$col -> $parent.$pcol"
  fi
done

echo ""
echo "=== 6. Kolom numerik yang mungkin selalu 0 ==="
sb "SELECT 'kpi_assignments.working_days_elapsed: '
        || 'total=' || count(*)
        || ' nol=' || count(*) FILTER (WHERE working_days_elapsed = 0)
        || ' bukan_nol=' || count(*) FILTER (WHERE working_days_elapsed <> 0)
    FROM kpi_assignments;" 2>/dev/null \
  || echo "  (kolom working_days_elapsed tidak ada)"

echo ""
echo "=== 7. MANAGED_DEPARTMENTS: apakah ada departments yang cocok? ==="
sb "SELECT
      CASE
        WHEN u.managed_departments IS NULL THEN 'user tanpa divisi'
        WHEN d.id IS NOT NULL THEN 'cocok (UUID -> departments.id)'
        ELSE 'TIDAK COCOK -> akan menghasilkan halaman kosong tanpa error'
      END AS hasil, count(*)
    FROM users u
    LEFT JOIN departments d ON u.managed_departments = d.id
    GROUP BY 1 ORDER BY 2 DESC;"

} > "$OUT" 2>&1

unset SUPABASE_PG_PASSWORD
cat "$OUT"