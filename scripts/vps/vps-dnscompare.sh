#!/bin/sh
# Resolver 1.1.1.1 timeout 4 dari 12 kali. Bandingkan alternatifnya
# sebelum mengubah mengubah /etc/resolv.conf.
#
# CATATAN: /etc/resolv.conf milik SELURUH mesin ini, dan di VPS ini ada
# aplikasi lain (crm-sales, hype-project-tracking, kol-system). Jadi
# perubahannya berdampak ke semuanya -- itu sebabnya diuji dulu, bukan
# langsung diganti.
set -u
HOST="rredcbao7tqz34pkqeelf8xx.168.231.118.146.sslip.io"
TES=20

cek() {
  NS="$1"
  OK=0
  GAGAL=0
  i=1
  while [ "$i" -le "$TES" ]; do
    if timeout 3 getent hosts "$HOST" >/dev/null 2>&1; then
      OK=$((OK + 1))
    else
      GAGAL=$((GAGAL + 1))
    fi
    i=$((i + 1))
  done
  printf "  %-16s OK %2s / %s   gagal %2s\n" "$NS" "$OK" "$TES" "$GAGAL"
}

echo "=== Uji tiap nameserver $TES kali ==="
echo "  (resolver saat ini: $(grep -E '^nameserver' /etc/resolv.conf | awk '{print $2}' | tr '\n' ' '))"
echo ""

# Ganti resolver sementara dengan rapat per-test.
uji() {
  NS="$1"
  cp /etc/resolv.conf /tmp/resolv.backup
  printf "nameserver %s\n" "$NS" > /etc/resolv.conf
  cek "$NS"
  cp /tmp/resolv.backup /etc/resolv.conf
  rm -f /tmp/resolv.backup
}

uji 1.1.1.1
uji 9.9.9.9
uji 8.8.8.8

echo ""
echo "=== Resolver dipulihkan ke semula? ==="
grep -E '^nameserver' /etc/resolv.conf | sed 's/^/  /'