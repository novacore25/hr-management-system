#!/bin/sh
# dig @1.1.1.1 selalu berhasil 25/25, tapi getent hosts sering gagal.
# Jadi "resolver 1.1.1.1 rusak" belum tentu benar -- yang rusak bisa
# jalur resolusi yang dipakai glibc, bukan resolver-nya.
#
# Bedanya yang mungkin:
#   - glibc mengirim kueri A dan AAAA BERSAMAAN; dig bawaan hanya A
#   - glibc memakai search domain; dig tidak
#   - glibc menghormati options timeout/attempts; berkasnya tidak punya
#     options, jadi pakai bawaan (timeout 5, attempts 2)
#
# Yang menentukan: menguji apa yang benar-benar dipakai saat build,
# yaitu `apk add` di dalam container Alpine.

set -u
DOMAIN="dl-cdn.alpinelinux.org"
TES=25

uji() {
  NAMA="$1"; PERINTAH="$2"
  OK=0; GAGAL=0
  i=1
  while [ "$i" -le "$TES" ]; do
    if eval "$PERINTAH" >/dev/null 2>&1; then OK=$((OK + 1)); else GAGAL=$((GAGAL + 1)); fi
    i=$((i + 1))
  done
  printf "  %-42s %-6s %s\n" "$NAMA" "$OK/$TES" "$([ "$GAGAL" -eq 0 ] && echo 'bersih' || echo "GAGAL $GAGAL")"
}

echo "=== 1.Resolver yang dipakai sistem ==="
grep -E '^nameserver|^options|^search' /etc/resolv.conf | sed 's/^/  /' || echo "  (hanya nameserver)"

echo ""
echo "=== 2. Perbandingan jalur resolusi, $TES kali masing-masing ==="
printf "  %-42s %-6s %s\n" METODE HASIL CATATAN
echo "  --------------------------------------------------------------------------"
uji "getent hosts (yang saya pakai dulu)" "timeout 4 getent hosts $DOMAIN"
uji "getent ahosts" "timeout 4 getent ahosts $DOMAIN"
uji "dig A saja" "dig +short +time=2 +tries=1 $DOMAIN A"
uji "dig AAAA saja" "dig +short +time=2 +tries=1 $DOMAIN AAAA"
uji "dig +short (default)" "dig +short +time=2 +tries=1 $DOMAIN"
uji "ping -c1 (pakai getaddrinfo)" "ping -c1 -W2 $DOMAIN"

echo ""
echo "=== 3. Apakah AAAA-nya yang bermasalah? ==="
echo "  berapa record A dan AAAA yang ada:"
printf "    A    : "; dig +short +time=2 +tries=1 "$DOMAIN" A | tr '\n' ' '; echo
printf "    AAAA : "; dig +short +time=2 +tries=1 "$DOMAIN" AAAA | tr '\n' ' '; echo

echo ""
echo "=== 4. TES YANG BENAR-BENAR MENENTUKAN: apk add di Alpine, 8 kali ==="
echo "  (ini yang gagal di build Coolify)"
echo "  container Alpine pakai musl, bukan glibc -- resolver-nya berbeda"
i=1
OKA=0
GAGALA=0
while [ "$i" -le 8 ]; do
  H=$(timeout 120 docker run --rm alpine:3.20 sh -c \
      'apk add --no-cache tzdata >/dev/null 2>&1 && echo OK || echo GAGAL' 2>&1 | tail -1)
  if [ "$H" = "OK" ]; then OKA=$((OKA + 1)); else GAGALA=$((GAGALA + 1)); fi
  printf "    percobaan %s: %s\n" "$i" "$H"
  i=$((i + 1))
done
echo "  apk add: berhasil $OKA dari 8, gagal $GAGALA"