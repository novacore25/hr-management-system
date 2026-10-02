#!/bin/sh
# Bandingkan sidik jari skema: produksi kita vs Supabase.
#
# Membaca dua CSV yang dibuat oleh novacore-schema-fingerprint, lalu
# melaporkan:
#   - tabel yang hanya ada di salah satu sisi
#   - kolom yang hanya ada di salah satu sisi
#   - kolom yang tipenya berbeda
#
# kolom yang hanya ada di SUPABASE = data yang akan hilang diam-diam.
# Itu yang paling penting, jadi ditampilkan lebih dulu.
#
# Dijalankan: ssh vps "cat /usr/local/bin/novacore-compare-schema | sh"
set -u

A=/tmp/fp-local.csv
B=/tmp/fp-supabase.csv

if [ ! -f "$A" ] || [ ! -f "$B" ]; then
  echo "ERROR: sidik jari skema belum lengkap." >&2
  echo "  $A: $([ -f "$A" ] && echo ada || echo TIDAK ADA)" >&2
  echo "  $B: $([ -f "$B" ] && echo ada || echo TIDAK ADA)" >&2
  echo >&2
  echo "Buat dulu dengan:" >&2
  echo "  cat /usr/local/bin/novacore-schema-fingerprint | sh -s local" >&2
  echo "  cat /usr/local/bin/novacore-schema-fingerprint | sh -s supabase" >&2
  exit 1
fi

cut -d'|' -f1 "$A" | sort -u > /tmp/tbl-a
cut -d'|' -f1 "$B" | sort -u > /tmp/tbl-b

echo "=== Ringkasan ==="
printf "  produksi kita : %s tabel, %s kolom\n" \
  "$(wc -l < /tmp/tbl-a)" "$(wc -l < "$A")"
printf "  Supabase      : %s tabel, %s kolom\n" \
  "$(wc -l < /tmp/tbl-b)" "$(wc -l < "$B")"

echo ""
echo "=== TABEL HANYA DI SUPABASE (kita tidak punya) ==="
hanyaB=$(comm -13 /tmp/tbl-a /tmp/tbl-b)
if [ -z "$hanyaB" ]; then
  echo "  (tidak ada)"
else
  echo "$hanyaB" | sed 's/^/  /'
fi

echo ""
echo "=== TABEL HANYA DI PRODUKSI KITA (Supabase tidak punya) ==="
hanyaA=$(comm -23 /tmp/tbl-a /tmp/tbl-b)
if [ -z "$hanyaA" ]; then
  echo "  (tidak ada)"
else
  echo "$hanyaA" | sed 's/^/  /'
fi

echo ""
echo "=== KOLOM HANYA DI SUPABASE (data akan hilang) ==="
cut -d'|' -f1,2 "$A" | sort -u > /tmp/col-a
cut -d'|' -f1,2 "$B" | sort -u > /tmp/col-b
hanyaB2=$(comm -13 /tmp/col-a /tmp/col-b)
if [ -z "$hanyaB2" ]; then
  echo "  (tidak ada)"
else
  echo "$hanyaB2" | sed 's/^/  /'
fi

echo ""
echo "=== KOLOM HANYA DI PRODUKSI KITA (dikosongkan / diisi NULL) ==="
hanyaA2=$(comm -23 /tmp/col-a /tmp/col-b)
if [ -z "$hanyaA2" ]; then
  echo "  (tidak ada)"
else
  echo "$hanyaA2" | sed 's/^/  /'
fi

echo ""
echo "=== TIPE DATA BEDA UNTUK KOLOM YANG SAMA ==="
# Kolom key = tabel|kolom; nilai = tipe|nullable.
awk -F'|' '{print $1 "|" $2 "|" $3 "|" $4}' "$A" | sort -u > /tmp/tp-a
awk -F'|' '{print $1 "|" $2 "|" $3 "|" $4}' "$B" | sort -u > /tmp/tp-b
beda=$(join -t'|' -j 1 -o 0,1.3,1.4,2.3,2.4 /tmp/tp-a /tmp/tp-b 2>/dev/null \
       | awk -F'|' '$3 != $5 || $4 != $6 {print "  " $1 "  kita:" $3 "/" $4 "  supabase:" $5 "/" $6}')
if [ -z "$beda" ]; then
  echo "  (tidak ada)"
else
  echo "$beda"
fi