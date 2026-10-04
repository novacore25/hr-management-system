#!/bin/sh
# Verifikasi FINAL staging vs Supabase, tahan terhadap resolver yang
# sesekali timeout.
#
# Kenapa ada percobaan ulang: resolver di VPS ini (1.1.1.1) gagal
# sekitar 35 persen query, dan gejalanya "could not translate host
# name ... Try again". Tanpa percobaan ulang, query yang gagal itu
# dibaca sebagai nilai kosong, lalu dibandingkan dengan nilai benar --
# hasilnya "data berbeda" padahal tidak ada yang berbeda sama sekali.
# Dua tabel sempat terbaca BEDA hanya karena alasan itu.
set -u
DB=vlu8rdt1abda7g69vbiwsk4p
LOCAL=db_hr_system
ENV_FILE=/root/.supabase-pg.env
COBA=6

# shellcheck disable=SC1090
set -a
. "$ENV_FILE"
set +a

sbrun() {
  # Jalankan SQL di Supabase, ulangi sampai berhasil. Query yang
  # gagal karena DNS tidak boleh dianggap jawaban apa pun.
  _i=1
  while [ "$_i" -le "$COBA" ]; do
    _out=$(docker exec -e PGPASSWORD="$SUPABASE_PG_PASSWORD" "$DB" \
      psql -h "$SUPABASE_PG_HOST" -p "$SUPABASE_PG_PORT" \
      -U "$SUPABASE_PG_USER" -d "$SUPABASE_PG_DB" -Atc "$1" 2>/dev/null)
    if [ -n "$_out" ] && [ "$_out" != "ERROR" ]; then
      printf "%s" "$_out"
      return 0
    fi
    _i=$((_i + 1))
    sleep 1
  done
  return 1
}

strun() {
  docker exec "$DB" psql -U postgres -d "$LOCAL" -Atc "$1" 2>/dev/null
}

TABEL="absensi_logs absensi_settings attendance company_letters daily_reports department_locations departments feedbacks holidays kpi_assignments kpi_histories kpi_settings kpis leave_requests letter_types monthly_scores office_locations overtime_requests payroll_addition_types payroll_deduction_types payroll_staff_settings payrolls users"

echo "=== Verifikasi isi, tidak bergantung urutan baris ==="
echo "  Hash dihitung dari semua baris yang sudah diurutkan, jadi"
echo "  perbedaan urutan fisik antar database tidak dihitung sebagai"
echo "  perbedaan data."
echo ""
printf "  %-24s %8s %8s  %-34s %-34s %s\n" TABEL BARIS_SB BARIS_ST HASH_SB HASH_ST HASIL
echo "  ---------------------------------------------------------------------------------------------------------"

COCOK=0; BEDA=0; GAGAL=0; TSB=0; TST=0
for t in $TABEL; do
  Q="SELECT count(*), md5(coalesce(string_agg(x.b, E'\n' ORDER BY x.b), ''))
        FROM (SELECT t::text AS b FROM public.\"$t\" t) x;"
  QS="SELECT count(*), md5(coalesce(string_agg(x.b, E'\n' ORDER BY x.b), ''))
        FROM (SELECT t::text AS b FROM _staging.\"$t\" t) x;"

  SB=$(sbrun "$Q")
  ST=$(strun "$QS")

  if [ -z "$SB" ]; then
    printf "  %-24s %8s %8s  %-34s %-34s %s\n" "$t" "-" "-" "-" "-" "GAGAL BACA (DNS)"
    GAGAL=$((GAGAL + 1))
    continue
  fi

  nsb=$(printf "%s" "$SB" | cut -d'|' -f1)
  hsb=$(printf "%s" "$SB" | cut -d'|' -f2)
  nst=$(printf "%s" "$ST" | cut -d'|' -f1)
  hst=$(printf "%s" "$ST" | cut -d'|' -f2)
  TSB=$((TSB + nsb)); TST=$((TST + nst))

  if [ "$hsb" = "$hst" ] && [ "$nsb" = "$nst" ]; then
    printf "  %-24s %8s %8s  %-34s %-34s %s\n" "$t" "$nsb" "$nst" \
      "$(printf '%s' "$hsb" | cut -c1-12)" "$(printf '%s' "$hst" | cut -c1-12)" "SAMA"
    COCOK=$((COCOK + 1))
  else
    printf "  %-24s %8s %8s  %-34s %-34s %s\n" "$t" "$nsb" "$nst" \
      "$(printf '%s' "$hsb" | cut -c1-12)" "$(printf '%s' "$hst" | cut -c1-12)" "BEDA"
    BEDA=$((BEDA + 1))
  fi
done

echo ""
echo "=== Ringkasan ==="
echo "  identik        : $COCOK dari 23"
echo "  benar-benar beda: $BEDA"
echo "  gagal dibaca    : $GAGAL"
echo "  total baris Supabase: $TSB"
echo "  total baris staging : $TST"
if [ "$BEDA" -eq 0 ] && [ "$GAGAL" -eq 0 ] && [ "$TSB" -eq "$TST" ]; then
  echo ""
  echo "  staging identik dengan Supabase, semua tabel."
else
  echo ""
  echo "  belum boleh lanjut ke tabel tujuan."
  exit 1
fi