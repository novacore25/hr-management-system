#!/bin/sh
# Bandingkan isi _staging dengan Supabase secara byte-per-byte.
#
# Jumlah baris saja tidak cukup: 2701 baris bisa saja berisi 2701 data
# yang salah. Yang diuji di sini adalah checksum seluruh isi tabel,
# dihitung di kedua sisi dengan perintah yang sama. Kalau checksum-nya
# sama, isi tabelnya sama persis.
#
# Versi pertama dari skrip ini memakai nama berkas "/tmp/pemeriksaan.txt"
# yang somehow berubah jadi "/tmp/p Examineran.txt" -- ada spasi di
# tengahnya, jadi awk memperlakukannya sebagai dua argumen berkas dan
# gagal. Sekarang memakai nama ASCII pendek tanpa spasi.
set -u
DB=vlu8rdt1abda7g69vbiwsk4p
LOCAL=db_hr_system
ENV_FILE=/root/.supabase-pg.env

# shellcheck disable=SC1090
set -a
. "$ENV_FILE"
set +a

TABEL="absensi_logs absensi_settings attendance company_letters daily_reports department_locations departments feedbacks holidays kpi_assignments kpi_histories kpi_settings kpis leave_requests letter_types monthly_scores office_locations overtime_requests payroll_addition_types payroll_deduction_types payroll_staff_settings payrolls users"

# md5 dari COPY (SELECT * FROM t) TO STDOUT.
# -A dan -t sengaja TIDAK dipakai: keduanya mengubah format keluaran
# dan akan membuat checksum berbeda although isinya sama.
checksum_supabase() {
  docker exec -e PGPASSWORD="$SUPABASE_PG_PASSWORD" "$DB" \
    psql -h "$SUPABASE_PG_HOST" -p "$SUPABASE_PG_PORT" \
    -U "$SUPABASE_PG_USER" -d "$SUPABASE_PG_DB" -q -c \
    "COPY (SELECT * FROM public.\"$1\") TO STDOUT;" 2>/dev/null | md5sum | cut -d' ' -f1
}

checksum_staging() {
  docker exec "$DB" psql -U postgres -d "$LOCAL" -q -c \
    "COPY (SELECT * FROM _staging.\"$1\") TO STDOUT;" 2>/dev/null | md5sum | cut -d' ' -f1
}

count_supabase() {
  docker exec -e PGPASSWORD="$SUPABASE_PG_PASSWORD" "$DB" \
    psql -h "$SUPABASE_PG_HOST" -p "$SUPABASE_PG_PORT" \
    -U "$SUPABASE_PG_USER" -d "$SUPABASE_PG_DB" -Atc \
    "SELECT count(*) FROM public.\"$1\";" 2>/dev/null
}

count_staging() {
  docker exec "$DB" psql -U postgres -d "$LOCAL" -Atc \
    "SELECT count(*) FROM _staging.\"$1\";" 2>/dev/null
}

echo "=== Tabel | baris SB | baris ST | checksum SB | checksum ST | hasil ==="
COCOK=0
BEDA=0
KOSONG=0
for t in $TABEL; do
  csb=$(checksum_supabase "$t"); cst=$(checksum_staging "$t")
  nsb=$(count_supabase "$t"); nst=$(count_staging "$t")
  if [ -z "$csb" ] || [ -z "$cst" ]; then
    printf "  %-24s  %-8s  %-8s  %-34s  %-34s  GAGAL BACA\n" "$t" "$nsb" "$nst" "$csb" "$cst"
    BEDA=$((BEDA + 1))
    continue
  fi
  if [ "$csb" = "$cst" ] && [ "$nsb" = "$nst" ]; then
    printf "  %-24s  %8s  %8s  %-34s  %-34s  SAMA\n" "$t" "$nsb" "$nst" "$(printf "%s" "$csb" | cut -c1-12)" "$(printf "%s" "$cst" | cut -c1-12)"
    COCOK=$((COCOK + 1))
    [ "$nsb" = "0" ] && KOSONG=$((KOSONG + 1))
  else
    printf "  %-24s  %8s  %8s  %-34s  %-34s  BEDA\n" "$t" "$nsb" "$nst" "$(printf "%s" "$csb" | cut -c1-12)" "$(printf "%s" "$cst" | cut -c1-12)"
    BEDA=$((BEDA + 1))
  fi
done

echo ""
echo "=== Ringkasan ==="
echo "  identik  : $COCOK dari 23"
echo "  berbeda  : $BEDA"
echo "  kosong   : $KOSONG (kpi_histories memang 0 di Supabase)"
echo ""
echo "  Total baris di Supabase : $(for t in $TABEL; do count_supabase "$t"; done | paste -sd+ | bc)"
echo "  Total baris di staging  : $(for t in $TABEL; do count_staging "$t"; done | paste -sd+ | bc)"