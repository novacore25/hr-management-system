#!/bin/sh
# Perbaiki dua hal yang gagal di novacore-stage2:
#
# 1. DDL Supabase memanggil extensions.uuid_generate_v4(). Schema
#    `extensions` itu milik Supabase dan tidak ada di produksi kita,
#    jadi 6 tabel gagal dibuat (hanya 19 dari 23 yang jadi).
#
# 2. Penghitungan batasan tadi melaporkan 151 constraint di _staging,
#    padahal tidak ada satu pun ADD CONSTRAINT yang ikut. Jadi either
#    query-nya salah, atau ada batasan implisit yang tidak terduga.
#    Ini harus dijelaskan, bukan diasumsikan.
set -u
DB=vlu8rdt1abda7g69vbiwsk4p
LOCAL=db_hr_system
DDL=/root/migrations/staging-ddl.sql

echo "=== 1. Semua pemanggilan ke schema lain di DDL ==="
grep -noE '\b(extensions|auth|storage|public|pg_catalog)\.[a-zA-Z_0-9]+(\(\))?' "$DDL" \
  | sort -t: -k2 | uniq -c -f0 | sed 's/^/  /' || echo "  (tidak ada)"

echo ""
echo "=== 2. Apa itu 151 constraint itu? ==="
echo "  connamespace breakdown:"
docker exec "$DB" psql -U postgres -d "$LOCAL" -c \
  "SELECT COALESCE(n.nspname,'(kosong/none)') AS schema,
          c.contype, count(*)
     FROM pg_constraint c
     LEFT JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE c.connamespace = (SELECT oid FROM pg_namespace WHERE nspname='_staging')
        OR c.connamespace IS NULL
    GROUP BY 1,2 ORDER BY 3 DESC;" 2>&1
echo "  (jika schema (kosong/none) yang dominan, maka query sebelumnya salahjoins)"
echo ""
echo "  constraint yang benar-benar menempel pada tabel staging:"
docker exec "$DB" psql -U postgres -d "$LOCAL" -c \
  "SELECT t.relname AS tabel, c.conname, c.contype
     FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = '_staging'
    ORDER BY 1,2;" 2>&1

echo ""
echo "=== 3. Daftar fungsi extensions yang dipanggil ==="
docker exec "$DB" psql -U postgres -d "$LOCAL" -Atc \
  "SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname LIKE '%uuid%';" | sed 's/^/  uuid di public: /'

echo ""
echo "=== 4. Perbaiki DDL: buang DEFAULT yang memanggil extensions ==="
cp "$DDL" "$DDL.bak"
# Hapus seluruh klausa DEFAULT yang memanggil fungsi di schema
# extensions. Staging tidak pernah menerima baris baru -- isinya
# disalin dari Supabase dengan id yang sama -- jadi DEFAULT di sini
# tidak pernah dipakai.
sed -i 's/ DEFAULT extensions\.[a-zA-Z_0-9]*(\(\))//g' "$DDL"
echo "  sisa 'extensions.': $(grep -c 'extensions\.' "$DDL" || true)"
echo "  jumlah DEFAULT berubah: $(diff "$DDL.bak" "$DDL" | grep -c '^<' || true)"

echo ""
echo "=== 5. Bangun ulang staging dari awal ==="
docker exec "$DB" psql -U postgres -d "$LOCAL" -v ON_ERROR_STOP=1 -q \
  -c "DROP SCHEMA IF EXISTS _staging CASCADE;" 2>&1 | sed 's/^/  /'
docker exec "$DB" psql -U postgres -d "$LOCAL" -v ON_ERROR_STOP=1 -q \
  -c "CREATE SCHEMA _staging;" 2>&1 | sed 's/^/  /'
docker exec -i "$DB" psql -U postgres -d "$LOCAL" -v ON_ERROR_STOP=1 -q \
  < "$DDL" > /tmp/staging.out 2>&1
RC=$?
if [ "$RC" -ne 0 ]; then
  echo "  GAGAL (kode $RC):"
  sed 's/^/    /' /tmp/staging.out | head -20
  exit 1
fi
echo "  semua pernyataan berhasil"

echo ""
echo "=== 6. Verifikasi ==="
# CATATAN: "nol constraint" adalah ekspektasi yang SALAH untuk PG 17+.
# Sejak PG 17, NOT NULL disimpan sebagai baris pg_constraint dengan
# contype='n'. Jadi 138 constraint 'n' itu normal, bukan masalah.
# Yang benar-benar harus nol adalah batasan yang memaksa urutan muat
# atau keunikan: PK, FK, UNIQUE. CHECK tidak masalah -- malah berguna
# karena ikut memvalidasi data yang diturunkan.
TBL=$(docker exec "$DB" psql -U postgres -d "$LOCAL" -Atc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='_staging';")
KOL=$(docker exec "$DB" psql -U postgres -d "$LOCAL" -Atc \
  "SELECT count(*) FROM information_schema.columns WHERE table_schema='_staging';")
n_notnull=$(docker exec "$DB" psql -U postgres -d "$LOCAL" -Atc \
  "SELECT count(*) FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
     JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='_staging' AND c.contype='n';")
n_check=$(docker exec "$DB" psql -U postgres -d "$LOCAL" -Atc \
  "SELECT count(*) FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
     JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='_staging' AND c.contype='c';")
n_kunci=$(docker exec "$DB" psql -U postgres -d "$LOCAL" -Atc \
  "SELECT count(*) FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
     JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='_staging' AND c.contype IN ('p','f','u');")
echo "  tabel             : $TBL (harus 23)"
echo "  kolom             : $KOL (audit sebelumnya: 297)"
echo "  NOT NULL (contype n): $n_notnull (normal di PG 17+)"
echo "  CHECK  (contype c)  : $n_check (ikut dari DDL, berguna)"
echo "  PK/FK/UNIQUE        : $n_kunci (harus 0)"
if [ "$TBL" -eq 23 ] && [ "$n_kunci" -eq 0 ]; then
  echo "  OK"
else
  echo "  BELUM BENAR"
  exit 1
fi