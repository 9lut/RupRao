#!/usr/bin/env bash
# End-to-end check against the running stack (https://localhost through Caddy).
# Usage: bash scripts/smoke_test.sh path/to/group-photo.jpg path/to/selfie-of-someone-in-it.jpg
set -euo pipefail
cd "$(dirname "$0")/.."
PHOTO=${1:?group photo}; SELFIE=${2:?selfie}
BASE=${BASE:-https://localhost/api}
set -a; source .env; set +a
c() { curl -sk --fail-with-body "$@"; }
j() { python -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

c "$BASE/health" | j "d['status'], d['checks']"
TOKEN=$(c -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_USERNAME\",\"password\":\"$ADMIN_PASSWORD\"}" | j "d['token']")
A=(-H "Authorization: Bearer $TOKEN")

EV=$(c "${A[@]}" -X POST "$BASE/admin/events" -H 'Content-Type: application/json' \
  -d '{"name":"[smoke-test]","access_code":"1234","retention_days":1}')
ID=$(echo "$EV" | j "d['id']"); SHARE=$(echo "$EV" | j "d['share_token']")
echo "event $ID share=$SHARE"

c "${A[@]}" -X POST "$BASE/admin/events/$ID/photos" -F "files=@$PHOTO" | j "len(d['uploaded']), d['errors']"
for _ in $(seq 1 60); do
  P=$(c "${A[@]}" "$BASE/admin/events/$ID" | j "d['pending_count']"); [ "$P" = "0" ] && break; sleep 2
done
c "${A[@]}" "$BASE/admin/events/$ID" | j "'faces:', d['face_count']"

echo -n "no code -> "; curl -sk -o /dev/null -w "%{http_code}\n" -X POST "$BASE/public/events/$SHARE/search" -F "file=@$SELFIE"
c -H "X-Event-Code: 1234" -X POST "$BASE/public/events/$SHARE/search" -F "file=@$SELFIE" \
  | j "'matches:', [r['similarity'] for r in d['results']], 'took', d['took_ms'], 'ms'"

c "${A[@]}" -X DELETE "$BASE/admin/events/$ID" && echo "✓ cleaned up"
