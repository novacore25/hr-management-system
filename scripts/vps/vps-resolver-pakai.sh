#!/bin/sh
# Terapkan resolver baru ke /etc/resolv.conf.
#
# Berkas ini menjaga SSH tetap hidup. Kalau salah tulis, saya mengunci
# diri sendiri dari mesin ini. Karena itu:
#
#   1. Backup dulu, dengan nama bercap waktu.
#   2. Tulis ke berkas sementara, periksa isinya, baru pasang.
#      Bukan menulis langsung ke /etc/resolv.conf.
#   3. Periksa lagi setelah dipasang. Kalau tidak sesuai, pulihkan.
#   4. Bukti resolver baru benar-benar dipakai, bukan hanya tertulis.
#
# Cara pakai:
#   cat /usr/local/bin/novacore-resolver-pakai | sh -s 9.9.9.9 149.112.112.112

set -u
BERKAS=/etc/resolv.conf
STEMP=/etc/resolv.conf.baru
CADANGAN_DIR=/root/resolv-backup
WAKTU=$(date +%Y%m%d-%H%M%S)

# --- 1. Validasi argumen --------------------------------------------
ADA=0
for a in "$@"; do
  ADA=$((ADA + 1))
  case "$a" in
    *[!0-9.]*)
      echo "ERROR: '$a' bukan alamat IPv4 yang valid." >&2
      exit 1
      ;;
    "")
      echo "ERROR: alamat kosong." >&2
      exit 1
      ;;
  esac
  BAGIAN=$(echo "$a" | tr '.' '\n' | wc -l)
  if [ "$BAGIAN" -ne 4 ]; then
    echo "ERROR: '$a' bukan alamat IPv4 (harus 4 bagian)." >&2
    exit 1
  fi
done

if [ "$ADA" -eq 0 ]; then
  echo "ERROR: tidak ada resolver yang diberikan." >&2
  echo "Contoh: cat /usr/local/bin/novacore-resolver-pakai | sh -s 9.9.9.9" >&2
  exit 1
fi

echo "=== 1. Resolver yang diminta ==="
i=1
for a in "$@"; do
  echo "  $i. $a"
  i=$((i + 1))
done

# --- 2. Backup -------------------------------------------------------
echo ""
echo "=== 2. Backup berkas lama ==="
mkdir -p "$CADANGAN_DIR"
cp -p "$BERKAS" "$CADANGAN_DIR/resolv.conf.$WAKTU"
if [ ! -f "$CADANGAN_DIR/resolv.conf.$WAKTU" ]; then
  echo "  GAGAL membuat backup. Tidak ada yang diubah." >&2
  exit 1
fi
echo "  disimpan: $CADANGAN_DIR/resolv.conf.$WAKTU"
echo "  isi lama:"
grep -E '^nameserver' "$CADANGAN_DIR/resolv.conf.$WAKTU" | sed 's/^/    /'

# --- 3. Tulis ke berkas sementara ------------------------------------
echo ""
echo "=== 3. Tulis berkas sementara (belum mengganti yang asli) ==="
: > "$STEMP"
for a in "$@"; do
  echo "nameserver $a" >> "$STEMP"
done
echo "  isi $STEMP:"
sed 's/^/    /' "$STEMP"

# --- 4. Periksa berkas sementara -------------------------------------
echo ""
echo "=== 4. Periksa sebelum dipasang ==="
JUMLAH=$(grep -c '^nameserver' "$STEMP")
if [ "$JUMLAH" -ne "$ADA" ]; then
  echo "  GAGAL: erwart $ADA baris nameserver, ada $JUMLAH. Tidak dipasang." >&2
  rm -f "$STEMP"
  exit 1
fi
echo "  $JUMLAH baris nameserver, sesuai."

# --- 5. Pasang -------------------------------------------------------
echo ""
echo "=== 5. Pasang ==="
cat "$STEMP" > "$BERKAS"
rm -f "$STEMP"
echo "  /etc/resolv.conf sekarang:"
sed 's/^/    /' "$BERKAS"

# --- 6. Verifikasi isi ------------------------------------------------
echo ""
echo "=== 6. Verifikasi isi berkas ==="
ADA_SAMA=$(grep -c '^nameserver' "$BERKAS")
if [ "$ADA_SAMA" -ne "$ADA" ]; then
  echo "  GAGAL: setelah ditulis, isinya tidak sesuai. Memulihkan." >&2
  cp -p "$CADANGAN_DIR/resolv.conf.$WAKTU" "$BERKAS"
  echo "  dipulihkan dari $CADANGAN_DIR/resolv.conf.$WAKTU" >&2
  exit 1
fi
echo "  isi sesuai ($ADA_SAMA baris)."

# --- 7. Bukti nyata, bukan sekadar berkas -----------------------------
echo ""
echo "=== 7. Bukti nyata: 20 lookup ke domain yang memblokir build ==="
OK=0
GAGAL=0
i=1
while [ "$i" -le 20 ]; do
  if timeout 4 getent hosts dl-cdn.alpinelinux.org >/dev/null 2>&1; then
    OK=$((OK + 1))
  else
    GAGAL=$((GAGAL + 1))
  fi
  i=$((i + 1))
done
echo "  berhasil: $OK dari 20"
echo "  gagal   : $GAGAL"

echo ""
echo "Untuk membatalkan:"
echo "  cp $CADANGAN_DIR/resolv.conf.$WAKTU /etc/resolv.conf"
if [ "$GAGAL" -eq 0 ]; then
  echo ""
  echo "=== SELESAI: resolver baru aktif, nol lookup gagal ==="
else
  echo ""
  echo "=== PERHATIAN: masih ada lookup yang gagal ==="
fi