#!/bin/sh
set -e

HOST="rredcbao7tqz34pkqeelf8xx.168.231.118.146.sslip.io"
IP="168.231.118.146"

echo "=== 1. Ambil CSRF Token ==="
CSRF_JSON=$(curl -sk "https://$IP/api/auth/csrf" -H "Host: $HOST" -c /tmp/ck.txt)
echo "$CSRF_JSON"
CSRF=$(echo "$CSRF_JSON" | sed -n 's/.*"csrfToken":"\([^"]*\)".*/\1/p')
echo "Token: $CSRF"

echo "=== 2. Kirim POST signin/google ==="
curl -sik -X POST "https://$IP/api/auth/signin/google" \
  -H "Host: $HOST" \
  -b /tmp/ck.txt \
  -c /tmp/ck2.txt \
  -d "csrfToken=$CSRF" > /tmp/resp.txt

grep -i "^location:" /tmp/resp.txt || true
echo "=== 3. Cookies yang disetel ==="
cat /tmp/ck2.txt

rm -f /tmp/ck.txt /tmp/ck2.txt /tmp/resp.txt
