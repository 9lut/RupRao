#!/usr/bin/env bash
# Back up Postgres (all metadata + face embeddings) and the MinIO photos bucket into ./backups/<timestamp>/
# Usage: bash scripts/backup.sh            (keeps the newest 7 backups)
set -euo pipefail
export MSYS_NO_PATHCONV=1  # Git Bash on Windows: keep container paths like /backups untouched
cd "$(dirname "$0")/.."

KEEP=${KEEP:-7}
STAMP=$(date +%Y%m%d-%H%M%S)
DIR="backups/$STAMP"
mkdir -p "$DIR"
set -a; source .env; set +a

echo "→ Postgres dump"
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "/backups/$STAMP/db.dump"

echo "→ Photos bucket"
docker compose exec -T minio mc mirror --quiet "local/${S3_BUCKET:-photos}" "/backups/$STAMP/photos" >/dev/null

du -sh "$DIR" | awk '{print "✓ Backup " $2 " (" $1 ")"}'

# Rotate old backups
ls -1d backups/*/ 2>/dev/null | sort | head -n -"$KEEP" | xargs -r rm -rf
