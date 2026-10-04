#!/bin/sh
# Jalankan query Coolify. Nama berkas SQL lewat argumen pertama.
#
# Kredensial diambil dari environment container coolify-db, jadi tidak
# ada yang perlu ditulis di sini.
#
# Skrip dikirim lewat scp, bukan ditulis inline di perintah ssh.
# Perintah ssh dengan heredoc inline selalu dihancurkan PowerShell
# sebelum sampai ke VPS (AGENTS.md §3.19).
set -u
U=$(docker exec coolify-db printenv POSTGRES_USER 2>/dev/null || echo coolify)
D=$(docker exec coolify-db printenv POSTGRES_DB 2>/dev/null || echo coolify)

NAMA="${1:-}"
if [ -z "$NAMA" ]; then
  echo "ERROR: nama berkas SQL belum diberikan." >&2
  echo "Contoh: cat /usr/local/bin/novacore-coolify-query | sh -s coolify-build-error.sql" >&2
  exit 1
fi

BERKAS="/root/migrations/$NAMA"
if [ ! -f "$BERKAS" ]; then
  echo "ERROR: $BERKAS tidak ada" >&2
  exit 1
fi

echo "berkas: $BERKAS"
echo ""
cat "$BERKAS" | docker exec -i coolify-db psql -U "$U" -d "$D" 2>&1