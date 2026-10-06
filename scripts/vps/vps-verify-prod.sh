#!/bin/sh
# Verifikasi produksi lewat hostname yang BENAR.
#
# Cek pertama salah: saya memakai hr.<ip>.sslip.io, sedangkan Traefik
# mendaftarkan rredcbao7tqz34pkqeelf8xx.<ip>.sslip.io dan
# app1.tntkreatif.com. Host yang tidak terdaftar --> HTTP 000, yang
# terlihat seperti aplikasi mati padahal aplikasinya jalan.
#
# Nama host diambil dari label Traefik di container, bukan diketik
# sendiri -- supaya pemeriksaan berikutnya tidak mengulangi kesalahan
# yang sama.

set -u
APP=$(docker ps --format '{{.Names}}' | grep '^rredcbao7tqz34pkqeelf8xx' | head -1)
if [ -z "$APP" ]; then
  echo "tidak ada container aplikasi"
  exit 1
fi

# Hostname yang benar, dibaca dari label Traefik.
RULE=$(docker inspect "$APP" --format '{{index .Config.Labels "traefik.http.routers.https-0-rredcbao7tqz34pkqeelf8xx.rule"}}' 2>/dev/null)
HOSTNAME=$(echo "$RULE" | sed -n 's/.*Host(`\([^`]*\)`).*/\1/p')
if [ -z "$HOSTNAME" ]; then
  echo "gagal membaca hostname dari label Traefik"
  exit 1
fi
IP=$(timeout 8 getent hosts "$HOSTNAME" 2>/dev/null | awk '{print $1}' | head -1)

echo "=== 0. Konteks ==="
echo "  hostname : $HOSTNAME"
echo "  ip       : ${IP:-TIDAK RESOLVE}"
echo "  app      : $APP"
echo ""
echo " _bandingkan: host yang dipakai cek sebelumnya adalah"
echo "  'hr.168.231.118.146.sslip.io' -- tidak terdaftar di Traefik,"
echo "  makanya HTTP 000. Bukan aplikasi mati."

if [ -z "$IP" ]; then
  echo "  hostname tidak resolve dari VPS -- lewati cek HTTP"
  exit 0
fi

get() {
  curl -s --resolve "$HOSTNAME:443:$IP" --max-time 20 "https://${HOSTNAME}$1"
}
code() {
  curl -s -o /dev/null -w "%{http_code}" --resolve "$HOSTNAME:443:$IP" \
    --max-time 20 "https://${HOSTNAME}$1"
}

echo ""
echo "=== 1. Health lewat domain publik ==="
get "/api/health" | head -c 400 | sed 's/^/  /'
echo ""

echo ""
echo "=== 2. Route & halaman (tanpa sesi) ==="
printf "  %-46s HTTP %s\n" "/api/health" "$(code /api/health)"
printf "  %-46s HTTP %s\n" "/" "$(code /)"
printf "  %-46s HTTP %s\n" "/login" "$(code /login)"
printf "  %-46s HTTP %s\n" "/absensi/admin/approvals" "$(code /absensi/admin/approvals)"
printf "  %-46s HTTP %s\n" "/api/absensi/leave?view=approvals" "$(code '/api/absensi/leave?view=approvals')"
printf "  %-46s HTTP %s\n" "/api/absensi/leave?mine=1" "$(code '/api/absensi/leave?mine=1')"

echo ""
echo "  diharapkan:"
echo "    /api/health                200  (publik)"
echo "    / dan /login               200  (publik)"
echo "    /absensi/admin/approvals   302  (dialihkan ke login, bukan 500)"
echo "    /api/absensi/leave?...     401  (butuh sesi, bukan 500)"

echo ""
echo "=== 3. Pesan 401 benar-benar soal sesi, bukan 500 ==="
get '/api/absensi/leave?view=approvals' | head -c 200 | sed 's/^/  /'
echo ""

echo ""
echo "=== 4. CSS dilayani sebagai stylesheet ==="
CSS=$(get "/" | grep -o '/_next/static/css/[^"]*\.css' | head -1)
if [ -n "$CSS" ]; then
  curl -s -o /dev/null --resolve "$HOSTNAME:443:$IP" --max-time 20 \
    -w "  %{content_type}  HTTP %{http_code}  $CSS\n" "https://${HOSTNAME}${CSS}"
else
  echo "  CSS tidak ditemukan di HTML"
fi

echo ""
echo "=== 5. Data cuti masih utuh ==="
DB=$(docker ps --format '{{.Names}}' | grep '^vlu8rdt1abda7g69vbiwsk4p$' | head -1)
if [ -n "$DB" ]; then
  echo "  status pengajuan:"
  docker exec "$DB" psql -U postgres -d db_hr_system -Atc \
    "SELECT '    ' || status || ' = ' || count(*)
       FROM public.leave_requests
      GROUP BY status ORDER BY status;" 2>&1
  echo "  tahap 2 tahap:"
  docker exec "$DB" psql -U postgres -d db_hr_system -Atc \
    "SELECT '    executive_status=' || executive_status || ' / hr_status=' || hr_status
            || ' -> ' || count(*) || ' baris'
       FROM public.leave_requests
      GROUP BY executive_status, hr_status
      ORDER BY 1;" 2>&1
  echo "  yang benar-benar lewat 2 tahap (ada UUID, bukan hanya nama):"
  docker exec "$DB" psql -U postgres -d db_hr_system -Atc \
    "SELECT '    ' || count(*) || ' baris punya executive_approved_by'
       FROM public.leave_requests WHERE executive_approved_by IS NOT NULL;" 2>&1
else
  echo "  container postgres tidak ditemukan"
fi