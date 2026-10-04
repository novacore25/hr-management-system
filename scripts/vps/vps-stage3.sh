#!/bin/sh
# Turunkan data Supabase ke schema _staging.
#
# Staging tidak punya PK/FK/UNIQUE, jadi urutan muat tidak masalah --
# itu salah satu alasan sengaja tidak memakai batasan di staging.
#
# Data diturunkan dengan COPY format teks apa adanya: pg_dump menulis
# escaping-nya sendiri, jadi nilai berisi koma, newline, backslash,
# atau NULL tidak akan rusak oleh filter di bawah.
set -u
DB=vlu8rdt1abda7g69vbiwsk4p
LOCAL=db_hr_system
ENV_FILE=/root/.supabase-pg.env
SEMENTARA=/tmp/supabase-data-only.sql

# shellcheck disable=SC1090
set -a
. "$ENV_FILE"
set +a

echo "=== 1. Hitung baris di Supabase SEBELUM turun (patokan) ==="
echo "  (dicatat dulu, supaya perbandingan tidak memakai data yang"
echo "   sudah kita turunkan sendiri sebagai pembanding)"
TABEL="absensi_logs absensi_settings attendance company_letters daily_reports department_locations departments feedbacks holidays kpi_assignments kpi_histories kpi_settings kpis leave_requests letter_types monthly_scores office_locations overtime_requests payroll_addition_types payroll_deduction_types payroll_staff_settings payrolls users"

: > /tmp/pExamineran.txt
for t in $TABEL; do
  n=$(docker exec -e PGPASSWORD="$SUPABASE_PG_PASSWORD" "$DB" \
    psql -h "$SUPABASE_PG_HOST" -p "$SUPABASE_PG_PORT" \
    -U "$SUPABASE_PG_USER" -d "$SUPABASE_PG_DB" -Atc \
    "SELECT count(*) FROM public.\"$t\";" 2>/dev/null || echo "ERR")
  printf "%s %s\n" "$t" "$n" >> /tmp/p Examineran.txt
done
awk '{printf "  %-26s %s\n", $1, $2}' /tmp/p Examineran.txt
TOTAL=$(awk '{s+=$2} END {print s}' /tmp/p Examineran.txt)
echo "  TOTAL: $TOTAL baris"

echo ""
echo "=== 2. Dump data-only dari Supabase ==="
docker exec -e PGPASSWORD="$SUPABASE_PG_PASSWORD" "$DB" \
  pg_dump -h "$SUPABASE_PG_HOST" -p "$SUPABASE_PG_PORT" \
  -U "$SUPABASE_PG_USER" -d "$SUPABASE_PG_DB" \
  --data-only --no-owner --no-privileges -n public > "$SEMENTARA" 2>/tmp/dd.err
RC=$?
if [ "$RC" -ne 0 ]; then
  echo "  GAGAL (kode $RC):"
  sed 's/^/    /' /tmp/dd.err | cut -c1-200 | head -10
  exit 1
fi
echo "  ukuran: $(wc -l < "$SEMENTARA") baris"
echo "  blok COPY: $(grep -c '^COPY ' "$SEMENTARA")"
echo "  setval   : $(grep -c '^SELECT pg_catalog.setval' "$SEMENTARA")"

echo ""
echo "=== 3. Arahkan ke _staging ==="
# Hanya dua jenis baris yang berubah:
#   COPY public.X FROM stdin;   -> COPY _staging.X FROM stdin;
#   setval untuk sekuens         -> dibuang, staging tidak pakai sekuens
# Sisanya (baris data) diteruskan apa adanya.
sed -e 's/^COPY public\./COPY _staging./' \
    -e '/^SELECT pg_catalog\.setval/d' \
    "$SEMENTARA" > /tmp/staging-data.sql
echo "  blok COPY setelah rewrite: $(grep -c '^COPY _staging\.' /tmp/staging-data.sql)"
echo "  sisa 'COPY public.': $(grep -c '^COPY public\.' /tmp/staging-data.sql || true)"

echo ""
echo "=== 4. Muat ke _staging ==="
# ON_ERROR_STOP=1: berhenti di baris pertama yang gagal, supaya
# kegagalan tidak tersamar jadi tabel kosong.
docker exec -i "$DB" psql -U postgres -d "$LOCAL" -v ON_ERROR_STOP=1 -q \
  < /tmp/staging-data.sql > /tmp/muat.out 2>&1
RC=$?
if [ "$RC" -ne 0 ]; then
  echo "  GAGAL (kode $RC). 20 baris terakhir:"
  tail -20 /tmp/muat.out | sed 's/^/    /'
  exit 1
fi
grep -iE 'error|warning' /tmp/muat.out | head -5 | sed 's/^/  /' || true
echo "  muat selesai"

echo ""
echo "=== 5. Jumlah baris di _staging ==="
TOTAL2=0
for t in $TABEL; do
  n=$(docker exec "$DB" psql -U postgres -d "$LOCAL" -Atc \
    "SELECT count(*) FROM _staging.\"$t\";" 2>/dev/null || echo "ERR")
  printf "%s %s\n" "$t" "$n" >> /tmp/pemeriksaan2.txt
  TOTAL2=$((TOTAL2 + n))
done
awk '{printf "  %-26s %s\n", $1, $2}' /tmp/pemeriksaan2.txt
echo "  TOTAL: $TOTAL2 baris"

echo ""
echo "=== 6. Bandingkan dengan patokan Supabase ==="
if diff /tmp/pemeriksaan.txt /tmp/pemeriksaan2.txt > /tmp/beda.txt 2>&1; then
  echo "  SEMUA 23 TABEL COCOK PERSIS"
else
  echo "  ADA SELISIH:"
  sed 's/^/    /' /tmp/beda.txt
fi
echo "  Supabase: $TOTAL baris | staging: $TOTAL2 baris"