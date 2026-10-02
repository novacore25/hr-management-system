#!/usr/bin/env bash
# Jalankan perintah di VPS lewat ssh tanpa melewati parser PowerShell.
#
# Kenapa file, bukan `ssh ... "perintah"`?
# PowerShellklad lebih dulu dari bash: `$var` diinterpolasi, `\"` jadi
# kacau, dan `\u` tidak di-escape. Hasilnya command yang berjalan sama
# sekali berbeda dari yang ditulis -- atau error yang mengarah ke
# tempat yang salah. Lihat AGENTS.md §2.3.
#
# Pakai: bash scripts/vps.sh '<perintah bash>'
#      bash scripts/vps.sh < file-perintah.sh
set -euo pipefail

VPS="root@168.231.118.146"
KEY="${HOME}/.ssh/id_vps"

# Container database milik aplikasi HR.
# PENTING: ada DUA container postgres:18-alpine di VPS ini. Yang satu
# milik aplikasi lain. Query ke yang salah BERHASIL TANPA ERROR --
# hanya mengembalikan data yang salah. Lihat docs/DEPLOY.md.
DB_CONTAINER="${DB_CONTAINER:-vlu8rdt1abda7g69vbiwsk4p}"

DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-db_hr_system}"

if [ "$#" -gt 0 ]; then
  CMD="$*"
else
  CMD="$(cat)"
fi

# Helper yang bisa dipakai di dalam CMD: `psql_qry 'SELECT 1'`
readonly PRELUDE="DB_CONTAINER='${DB_CONTAINER}' DB_USER='${DB_USER}' DB_NAME='${DB_NAME}'"

ssh -i "$KEY" -o ConnectTimeout=20 -o StrictHostKeyChecking=accept-new \
  "$VPS" "export ${PRELUDE}; ${CMD}"