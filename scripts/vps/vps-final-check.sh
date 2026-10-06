#!/bin/sh
# Verifikasi produksi setelah deploy -- apakah container-nya benar-benar
# sehat, atau Coolify hanya belum protes.
#
# Dipakai setelah setiap deploy:
#
#   scp scripts/vps/vps-final-check.sh vps:/root/
#   ssh vps "cat /root/vps-final-check.sh | sh"
#
# Yang dicek, dan mengapa masing-masing penting:
#
#   1. Status health container -- dibaca dari HEALTHCHECK di Dockerfile.
#      Kalau ini "healthy", maka health check yang diperbaiki benar-benar
#      bekerja, bukan sekadar tidak protes.
#   2. Error di log container sejak start.
#   3. Riwayat health check -- apakah ada yang sempat gagal.
#   4. Container lama yang masih nyangkut.
#   5. Ukuran image.
#
# Prefix `rredcbao7tqz34pkqeelf8xx` itu UUID aplikasi di Coolify, bukan
# commit -- sudah diperiksa di VPS. Repository-nya bernama
# `rredcbao7tqz34pkqeelf8xx:<commit>`, jadi prefix ini tetap berlaku
# setelah deploy berikutnya. Kalau suatu saat prefix ini tidak cocok,
# cari lagi dengan: docker ps --format '{{.Names}} | {{.Image}}'

set -u
APP=$(docker ps --format '{{.Names}}' | grep '^rredcbao7tqz34pkqeelf8xx' | head -1)

echo "=== 1. Health check dari Dockerfile ==="
docker inspect "$APP" \
  --format '  status  : {{.State.Status}}
  image   : {{.Config.Image}}
  started : {{.State.StartedAt}}
  restart : {{.RestartCount}}
  oom     : {{.State.OOMKilled}}' 2>&1 | sed 's/^/  /'
echo ""
docker inspect "$APP" \
  --format '  health  : {{if .State.Health}}{{.State.Health.Status}}{{else}}tidak ada{{end}}' 2>&1 | sed 's/^/  /'
echo ""
echo "  5 hasil health check terakhir:"
docker inspect "$APP" --format '{{if .State.Health}}{{range .State.Health.Log}}    {{.ExitCode}} | {{.Output}}{{end}}{{end}}' 2>&1 \
  | cut -c1-120 | sed 's/^/  /'

echo ""
echo "=== 2. Error di log sejak container start ==="
docker logs "$APP" 2>&1 | grep -icE 'error|fatal|exception|cannot|unhandled' \
  | sed 's/^/  jumlah baris error: /'
docker logs "$APP" 2>&1 | grep -iE 'error|fatal|exception|cannot|unhandled' \
  | tail -8 | cut -c1-170 | sed 's/^/  /'

echo ""
echo "=== 3. Lima baris terakhir log aplikasi ==="
docker logs "$APP" 2>&1 | tail -5 | cut -c1-170 | sed 's/^/  /'

echo ""
echo "=== 4. Apakah ada container lama yang masih nyangkut? ==="
docker ps -a --format '  {{.Names}} | {{.Status}}' | grep rredcbao | sed 's/^/  /'

echo ""
echo "=== 5. Ukuran image baru vs yang lama ==="
docker images --format '  {{.Repository}} {{.Size}}' \
  | grep rredcbao7tqz34pkqeelf8xx | sort -u | head -4