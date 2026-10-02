#!/bin/sh
# Ambil "sidik jari" skema: tabel + kolom + tipe + nullable.
#
# Dijalankan terhadap database mana pun (produksi kita ATAU Supabase)
# supaya keduanya bisa dibandingkan dengan diff yang persis sama.
#
# PENTING: kolom_default sengaja TIDAK ikut. Nilainya mengandung koma
# dan baris baru (mis. nextval('users_id_seq'::regclass)), sehingga
# membuat pemisahan kolom jadi tidak bisa dipercaya -- dan versi
# pertama skrip ini salah melaporkan "302 tabel" untuk database yang
# hanya punya 26.
#
# Pemisah memakai "|" supaya tidak pernah muncul di nama kolom.
#
# Dijalankan: ssh vps "cat /usr/local/bin/novacore-schema-fingerprint | sh -s <mode>"
set -u

DB=vlu8rdt1abda7g69vbiwsk4p
LOCAL=db_hr_system

MODE="${1:-local}"

# Berkas keluaran berbeda per mode, supaya keduanya bisa dibandingkan
# tanpa saling menimpa.
case "$MODE" in
  local)     OUT=/tmp/fp-local.csv ;;
  supabase)  OUT=/tmp/fp-supabase.csv ;;
  *) echo "MODE tidak dikenal: $MODE" >&2; exit 1 ;;
esac

Q="
SELECT c.table_name || '|' || c.column_name || '|' || c.data_type
       || '|' || c.is_nullable
FROM information_schema.columns c
JOIN information_schema.tables t
  ON t.table_schema = c.table_schema AND t.table_name = c.table_name
WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
ORDER BY c.table_name, c.column_name;
"

case "$MODE" in
  local)
    docker exec "$DB" psql -U postgres -d "$LOCAL" -Atc "$Q" > "$OUT"
    ;;
  supabase)
    if [ ! -f /root/.supabase-pg.env ]; then
      echo "ERROR: /root/.supabase-pg.env tidak ada" >&2
      exit 1
    fi
    . /root/.supabase-pg.env
    # Password dikirim lewat environment container, bukan argumen --
    # supaya tidak muncul di daftar proses (ps) dan tidak ikut ter-log.
    docker exec -i -e PGPASSWORD="$SUPABASE_PG_PASSWORD" \
        "$DB" psql -h "$SUPABASE_PG_HOST" -p "$SUPABASE_PG_PORT" \
           -U "$SUPABASE_PG_USER" -d "$SUPABASE_PG_DB" \
           -Atc "$Q" > "$OUT"
    rc=$?
    unset SUPABASE_PG_PASSWORD
    if [ $rc -ne 0 ]; then
      echo "ERROR: psql ke Supabase gagal (kode $rc)" >&2
      exit $rc
    fi
    ;;
  *)
    echo "MODE tidak dikenal: $MODE" >&2
    exit 1
    ;;
esac

echo "kolom : $(wc -l < "$OUT")"
echo "tabel : $(cut -d'|' -f1 "$OUT" | sort -u | wc -l)"
echo ""
echo "daftar tabel:"
cut -d'|' -f1 "$OUT" | sort -u | sed 's/^/  /'