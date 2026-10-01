#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Setup database NovaCore HR di VPS
# Aman: idempotent, ada backup, bisa dijalankan berulang.
# ═══════════════════════════════════════════════════════════════

set -uo pipefail

DB_CONTAINER="vlu8rdt1abda7g69vbiwsk4p"
DB_NAME="db_hr_system"
DB_USER="postgres"
WORKDIR="/root/hr-migration"

echo "=============================================="
echo " Setup Database: $DB_NAME"
echo " Container:     $DB_CONTAINER"
echo "=============================================="

# ── 1. Cek container ──────────────────────────────────────────
if ! docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
  echo "[ERROR] Container '$DB_CONTAINER' tidak ditemukan atau tidak running."
  echo "Cek dengan: docker ps --format '{{.Names}}' | grep postgres"
  exit 1
fi
echo "[1/5] ✅ Container ditemukan"

# ── 2. Cek / buat database ────────────────────────────────────
EXISTS=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -Atc \
  "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" 2>/dev/null)

if [ "$EXISTS" = "1" ]; then
  echo "[2/5] ✅ Database '$DB_NAME' sudah ada"

  TBL=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -Atc \
    "SELECT count(*) FROM pg_tables WHERE schemaname='public'" 2>/dev/null)

  if [ "${TBL:-0}" -gt 5 ]; then
    echo ""
    echo "⚠️  PERINGATAN: '$DB_NAME' sudah punya $TBL tabel."
    echo "    Kalau Anda mau MENGHAPUS dan mulai ulang, ketik: RESET"
    echo "    Kalau mau lanjut/lewati, ketik: SKIP"
    read -r JAWABAN </dev/tty || JAWABAN="SKIP"

    if [ "$JAWABAN" = "RESET" ]; then
      TS=$(date +%Y%m%d_%H%M%S)
      echo ""
      echo "→ Backup dulu ke /root/hr-backup-${TS}.sql"
      docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" \
        > "/root/hr-backup-${TS}.sql"
      echo "  ✅ Backup: /root/hr-backup-${TS}.sql"
      docker exec "$DB_CONTAINER" dropdb -U "$DB_USER" "$DB_NAME"
      docker exec "$DB_CONTAINER" createdb -U "$DB_USER" "$DB_NAME"
      echo "  ✅ Database dibuat ulang (kosong)"
    else
      echo "  ⏭ Lewati pembuatan database"
      echo ""
      echo "=== SELESAI (database tidak diubah) ==="
      exit 0
    fi
  fi
else
  echo "[2/5] → Membuat database '$DB_NAME'"
  docker exec "$DB_CONTAINER" createdb -U "$DB_USER" "$DB_NAME" || {
    echo "[ERROR] Gagal membuat database"; exit 1;
  }
  echo "      ✅ Database dibuat"
fi

# ── 3. Ambil file SQL ─────────────────────────────────────────
echo "[3/5] → Menyiapkan file migration"

if [ -d /root/hr-management-system/drizzle ]; then
  echo "      ✅ Migration ditemukan dari clone lokal"
  SQLDIR="/root/hr-management-system/drizzle"
elif [ -d "$WORKDIR" ]; then
  SQLDIR="$WORKDIR"
else
  echo "      → Clone repo (butuh GitHub SSH key di server)"
  git clone --depth 1 git@github.com:novacore25/hr-management-system.git \
    /root/hr-management-system 2>&1 | sed 's/^/        /'
  if [ ! -d /root/hr-management-system/drizzle ]; then
    echo "[ERROR] Clone gagal atau folder drizzle tidak ada."
    echo "Upload manual dengan:"
    echo "  scp drizzle/*.sql root@168.231.118.146:/root/hr-migration/"
    exit 1
  fi
  SQLDIR="/root/hr-management-system/drizzle"
fi

# ── 4. Jalankan migration ─────────────────────────────────────
echo "[4/5] → Menjalankan migration"
echo ""

for f in $(ls "$SQLDIR"/*.sql 2>/dev/null | sort); do
  FN=$(basename "$f")
  echo "  ▸ $FN"

  docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" \
    -v ON_ERROR_STOP=1 -q < "$f" 2>&1 | sed 's/^/      /'

  RC=${PIPESTATUS[0]}
  if [ "$RC" -ne 0 ]; then
    # Idempotency: error "already exists" wajar kalau di-run ulang
    if docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" \
         -q < "$f" 2>&1 | grep -qiE 'already exists|duplicate key'; then
      echo "      ⏭ Sudah ada sebelumnya (skip)"
    else
      echo "      ❌ GAGAL (exit $RC)"
      echo "         Cek: docker logs --tail 50 $DB_CONTAINER"
      exit 1
    fi
  else
    echo "      ✅ OK"
  fi
done

# ── 5. Verifikasi ─────────────────────────────────────────────
echo ""
echo "[5/5] → Verifikasi"
echo ""
echo "  Jumlah tabel:"
docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -Atc \
  "SELECT count(*) FROM pg_tables WHERE schemaname='public'" | sed 's/^/      /'

echo ""
echo "  Daftar tabel:"
docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -Atc \
  "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename" \
  | sed 's/^/      /'

echo ""
echo "  Tabel Auth.js:"
for t in users accounts sessions verification_tokens; do
  R=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -Atc \
    "SELECT count(*) FROM pg_tables WHERE tablename='$t'" 2>/dev/null)
  [ "$R" = "1" ] && echo "      ✅ $t" || echo "      ❌ $t HILANG"
done

echo ""
echo "=============================================="
echo " ✅ SETUP DATABASE SELESAI"
echo "=============================================="
echo ""
echo "Langkah berikutnya: deploy aplikasi di Coolify"
echo " lalu buka /api/health untuk cek koneksi."
