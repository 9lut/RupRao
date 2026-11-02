#!/usr/bin/env bash
# Move this machine's RupRao data to a server over SSH: database (events, faces, accounts),
# photos, and the face model. Run it on your own computer (Git Bash on Windows works).
#
#   bash scripts/push-to-server.sh you@34.87.12.34 -i ~/.ssh/ruprao
#   IMAGES=1 bash scripts/push-to-server.sh you@34.87.12.34 -i ~/.ssh/ruprao   # also copy built images
#
# Before: the server is set up (scripts/gcp-setup.sh) and the stack has been started once
# (docker compose ... up -d), so Postgres, MinIO and the bucket exist.
# It REPLACES the server's database and photos with this machine's.
set -euo pipefail
export MSYS_NO_PATHCONV=1  # Git Bash on Windows: keep remote paths untouched
cd "$(dirname "$0")/.."

HOST=${1:?usage: push-to-server.sh user@host [ssh options, e.g. -i ~/.ssh/key]}
shift
SSH=(ssh -o ServerAliveInterval=30 "$@" "$HOST")
REMOTE=${REMOTE_DIR:-RupRao}  # relative to the remote home; gcp-setup.sh links ~/RupRao to the data disk

echo "→ Checking the server"
"${SSH[@]}" "test -f $REMOTE/.env && docker compose -f $REMOTE/docker-compose.yml ps --services --status running | grep -qx postgres" \
  || { echo "✗ $HOST: no running RupRao in ~/$REMOTE — run scripts/gcp-setup.sh and start the stack first"; exit 1; }

echo "→ Backing up this machine"
bash scripts/backup.sh
NAME=$(ls -1d backups/*/ | grep -E '/[0-9]{8}-[0-9]{6}/$' | sort | tail -1 | xargs basename)
du -sh "backups/$NAME" | awk '{print "  " $2 " (" $1 ")"}'

echo "→ Sending backup $NAME"
# A tar stream is quicker than scp for thousands of small files; JPEGs don't compress, so no gzip.
tar -cf - -C backups "$NAME" | "${SSH[@]}" "mkdir -p $REMOTE/backups && tar -xf - -C $REMOTE/backups"

if [ -d data/models/models ] && ! "${SSH[@]}" "test -d $REMOTE/data/models/models"; then
  echo "→ Sending the face model ($(du -sh data/models | cut -f1)) — saves the server downloading it"
  tar -cf - -C data models | "${SSH[@]}" "mkdir -p $REMOTE/data && tar -xf - -C $REMOTE/data"
fi

if [ "${IMAGES:-0}" = "1" ]; then
  echo "→ Sending built Docker images (skip the build on the server)"
  docker save ai-photo-finder-api ai-photo-finder-web | gzip -1 | "${SSH[@]}" "gunzip | docker load"
fi

echo "→ Restoring on the server"
"${SSH[@]}" "cd $REMOTE && RESTORE_CONFIRM=restore bash scripts/restore.sh backups/$NAME"

echo
echo "✓ Done. Open your site and sign in to /admin with the server's .env admin account."
