#!/usr/bin/env bash
# Ship the latest code to the server: it pulls from GitHub and rebuilds only what changed.
# Run on your own computer AFTER pushing your commits:
#
#   git push
#   bash scripts/deploy.sh                                  # via gcloud + IAP (VM "ruprao", asia-southeast1-b)
#   bash scripts/deploy.sh you@34.87.12.34 -i ~/.ssh/ruprao # or plain ssh
#
# Data (database, photos) is untouched; database migrations run when the api restarts.
set -euo pipefail

REMOTE_CMD='set -e
cd ~/RupRao
before=$(git rev-parse --short HEAD)
git pull --ff-only
after=$(git rev-parse --short HEAD)
echo "code: $before -> $after"
docker compose -f docker-compose.yml -f docker-compose.gcp.yml up -d --build --remove-orphans
# Caddy reads its config once at start, and compose cannot see a change inside a mounted file.
if git diff --name-only "$before" "$after" | grep -q "^infra/caddy/"; then
  docker compose -f docker-compose.yml -f docker-compose.gcp.yml restart caddy
fi
docker image prune -f >/dev/null
docker compose -f docker-compose.yml -f docker-compose.gcp.yml ps --format "table {{.Service}}\t{{.Status}}"'

if [ $# -gt 0 ]; then
  HOST=$1
  shift
  ssh "$@" "$HOST" "$REMOTE_CMD"  # options must come before the host
else
  # Port 22 only accepts Google's IAP range (docs/deploy-gcp.md §6), so tunnel through IAP.
  gcloud compute ssh "${VM:-ruprao}" --zone "${ZONE:-asia-southeast1-b}" --tunnel-through-iap --command "$REMOTE_CMD"
fi
