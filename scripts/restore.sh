#!/usr/bin/env bash
# Restore a backup made by backup.sh. REPLACES the current database and photos.
# Usage: bash scripts/restore.sh backups/20261002-120000
#        RESTORE_CONFIRM=restore bash scripts/restore.sh backups/...   (no prompt)
set -euo pipefail
export MSYS_NO_PATHCONV=1  # Git Bash on Windows: keep container paths like /backups untouched
cd "$(dirname "$0")/.."
SRC=${1:?usage: restore.sh backups/<timestamp>}
NAME=$(basename "$SRC")
[ -f "$SRC/db.dump" ] || { echo "No db.dump in $SRC"; exit 1; }
set -a; source .env; set +a

# RESTORE_CONFIRM=restore skips the prompt (used by push-to-server.sh over SSH).
ok=${RESTORE_CONFIRM:-}
[ -n "$ok" ] || read -r -p "This replaces ALL current data with $NAME. Type 'restore' to continue: " ok
[ "$ok" = "restore" ] || exit 1

docker compose stop api worker
docker compose exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists "/backups/$NAME/db.dump"
docker compose exec -T minio mc mirror --overwrite --remove --quiet "/backups/$NAME/photos" "local/${S3_BUCKET:-photos}" >/dev/null
docker compose start api worker
echo "✓ Restored $NAME"
