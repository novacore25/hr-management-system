#!/bin/sh
# Pilih resolver dengan mengujinya langsung, TANPA menyentuh
# /etc/resolv.conf.
#
# Versi sebelumnya menguji resolver dengan menulis ulang
# /etc/resolv.conf lalu memulihkannya. Cara itu berisiko: kalau skrip
# terputus di tengah, berkas host tertinggal dalam keadaan salah --
# dan itu akan mematikan SSH, bukan hanya Docker.
#
# Prinsipnya: kali ini hanya dibaca.

set -u

DOMAIN="dl-cdn.alpinelinux.org"
TES=25

if ! command -v dig >/dev/null 2>&1; then
  echo "ERROR: dig tidak ada di host." >&2
  exit 1
fi

echo "=== 1. Resolver sekarang (tidak diubah) ==="
cat /etc/resolv.conf | grep -E '^nameserver' | sed 's/^/  /'

echo ""
echo "=== 2. Uji $TES kali per kandidat, tanpa mengubah apa pun ==="
echo "  (domain: $DOMAIN, karena itulah yang memblokir build)"
printf "\n  %-18s %-10s %-8s %-12s %s\n" RESOLVER BERHASIL GAGAL RATA_MS CATATAN
echo "  ------------------------------------------------------------------------------"

uji() {
  NS="$1"
  CATATAN="$2"
  OK=0
  GAGAL=0
  TOTAL_MS=0
  i=1
  while [ "$i" -le "$TES" ]; do
    # +time=2 +tries=1 supaya tidak menggantung lama kalau gagal
    KELUAR=$(dig +short +time=2 +tries=1 "@$NS" "$DOMAIN" 2>/dev/null)
    if [ -n "$KELUAR" ]; then
      OK=$((OK + 1))
      MS=$(dig +time=2 +tries=1 "@$NS" "$DOMAIN" 2>/dev/null \
             | awk '/Query time:/ {print $4; exit}')
      [ -n "$MS" ] && TOTAL_MS=$((TOTAL_MS + MS))
    else
      GAGAL=$((GAGAL + 1))
    fi
    i=$((i + 1))
  done
  if [ "$OK" -gt 0 ]; then
    RATA=$((TOTAL_MS / OK))
  else
    RATA=0
  fi
  printf "  %-18s %-10s %-8s %-12s %s\n" "$NS" "$OK" "$GAGAL" "${RATA}ms" "$CATATAN"
}

uji 1.1.1.1   "sekarang, terbukti rusak"
uji 8.8.8.8   "Google, juga rusak"
uji 9.9.9.9   "Quad9 utama"
uji 149.112.112.112 "Quad9 kedua"
uji 208.67.222.222  "OpenDNS"
uji 1.0.0.1   "Cloudflare cadangan"

echo ""
echo "=== 3. Apa yang akan ditulis ke /etc/resolv.conf (belum ditulis) ==="
echo "  Kandidat terbaik akan ditentukan dari hasil di atas."