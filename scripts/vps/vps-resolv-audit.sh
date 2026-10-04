#!/bin/sh
# Resolver di dalam container menunjukkan DUA 'nameserver 1.1.1.1'
# dan total empat baris. Itu tidak wajar, dan harus diketahui apakah
# itu kelewatan atau ada yang rusak -- termasuk oleh skrip uji saya
# sendiri, yang pernah menulis ulang /etc/resolv.conf lalu memulihkannya.
set -u

cat > /tmp/i1.sh <<'XEOF'
set -u
echo "=== 1. /etc/resolv.conf di host, mentah ==="
ls -l /etc/resolv.conf | awk '{print "  mode:", $1, "ukuran:", $5, "byte"}'
echo "  isi:"
cat -A /etc/resolv.conf | sed 's/^/    /'

echo ""
echo "=== 2. Apakah ini symlink (dikelola systemd atau DHCP)? ==="
readlink -f /etc/resolv.conf | sed 's/^/  target: /'
if [ -L /etc/resolv.conf ]; then echo "  YA, symlink"; else echo "  bukan symlink"; fi

echo ""
echo "=== 3. specialised: apakah ada proses yang menulisi berkasnya? ==="
systemctl is-active systemd-resolved 2>/dev/null | sed 's/^/  systemd-resolved: /' || echo "  systemd-resolved tidak ada"
ls -l /etc/resolv.conf* 2>/dev/null | sed 's/^/  /'
XEOF
cat /tmp/i1.sh | sh

cat > /tmp/i2.sh <<'XEOF'
set -u
echo ""
echo "=== 4. Konfigurasi resolver di daemon Docker ==="
cat /etc/docker/daemon.json 2>/dev/null | sed 's/^/  /' || echo "  (tidak ada /etc/docker/daemon.json)"
echo ""
echo "=== 5. Gitri jumlah baris nameserver di host ==="
grep -c '^nameserver' /etc/resolv.conf | sed 's/^/  baris nameserver: /'

echo ""
echo "=== 6. Apakah berkas backup dari skrip uji masih ada? ==="
ls -l /tmp/resolv.backup 2>/dev/null | sed 's/^/  /' || echo "  (sudah dihapus, itu yang diharapkan: skrip mengosongkannya di akhir)"
XEOF
cat /tmp/i2.sh | sh

cat > /tmp/i3.sh <<'XEOF'
set -u
echo ""
echo "=== 7. Uji berulang: berapa nameserver yang dipakai glibc? ==="
echo "  glibc umumnya hanya memakai 2 nameserver pertama; sisanya diabaikan."
echo "  Kalau 1.1.1.1 occupies dua slot pertama, hanya 1.1.1.1 yang dipakai."
i=1
while [ "$i" -le 10 ]; do
  printf "  percobaan %2s: " "$i"
  timeout 4 getent hosts dl-cdn.alpinelinux.org >/dev/null 2>&1 && echo "OK" || echo "GAGAL"
  i=$((i + 1))
done
XEOF
cat /tmp/i3.sh | sh