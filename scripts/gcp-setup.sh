#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 VM on GCP for RupRao. Run ON the VM:
#   curl -fsSL https://raw.githubusercontent.com/9lut/RupRao/main/scripts/gcp-setup.sh | bash
# Safe to re-run. What it does:
#   1. If a data disk named "ruprao-data" is attached: format it (only when blank), mount it at
#      /mnt/data and keep Docker (images + volumes = database and photos) and the code on it.
#   2. Installs Docker, rotates container logs, adds 2 GB swap.
#   3. Clones the repo and creates .env from the example.
set -euo pipefail

REPO=${REPO:-https://github.com/9lut/RupRao.git}
DATA_DISK=${DATA_DISK:-ruprao-data}
DATA_DEV="/dev/disk/by-id/google-$DATA_DISK"
DATA_DIR=/mnt/data

echo "→ Data disk"
if [ -e "$DATA_DEV" ]; then
  if ! sudo blkid "$DATA_DEV" >/dev/null 2>&1; then
    echo "  formatting $DATA_DEV (new, empty disk)"
    sudo mkfs.ext4 -q -m 0 -E lazy_itable_init=0,lazy_journal_init=0,discard "$DATA_DEV"
  fi
  sudo mkdir -p "$DATA_DIR"
  if ! mountpoint -q "$DATA_DIR"; then
    sudo mount -o discard,defaults "$DATA_DEV" "$DATA_DIR"
  fi
  UUID=$(sudo blkid -s UUID -o value "$DATA_DEV")
  grep -q "$UUID" /etc/fstab || echo "UUID=$UUID $DATA_DIR ext4 discard,defaults,nofail 0 2" | sudo tee -a /etc/fstab >/dev/null
  sudo chown "$USER:$USER" "$DATA_DIR"
  DOCKER_ROOT="$DATA_DIR/docker"
  DIR=${DIR:-$DATA_DIR/RupRao}
  df -h "$DATA_DIR" | tail -1 | awk '{print "  mounted " $6 " (" $2 ")"}'
else
  echo "  no disk called $DATA_DISK — using the boot disk"
  DOCKER_ROOT=/var/lib/docker
  DIR=${DIR:-$HOME/RupRao}
fi

echo "→ Docker settings (log rotation, storage location: $DOCKER_ROOT)"
sudo mkdir -p /etc/docker
echo "{\"data-root\":\"$DOCKER_ROOT\",\"log-driver\":\"json-file\",\"log-opts\":{\"max-size\":\"10m\",\"max-file\":\"3\"}}" \
  | sudo tee /etc/docker/daemon.json >/dev/null

echo "→ Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
else
  sudo systemctl restart docker
fi
sudo usermod -aG docker "$USER"

echo "→ Swap 2 GB (the face model + image builds need headroom)"
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  # Use swap only as a safety net, not for normal work.
  echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swappiness.conf >/dev/null
  sudo sysctl -q -p /etc/sysctl.d/99-swappiness.conf
fi

echo "→ Code in $DIR"
if [ ! -d "$DIR/.git" ]; then
  git clone "$REPO" "$DIR"
else
  git -C "$DIR" pull --ff-only
fi
[ "$DIR" = "$HOME/RupRao" ] || ln -sfn "$DIR" "$HOME/RupRao"

IP=$(curl -fsS -H 'Metadata-Flavor: Google' \
  http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip 2>/dev/null || true)

echo "→ .env"
if [ ! -f "$DIR/.env" ]; then
  # Fresh server: every secret is random and never leaves this machine. Read the admin password
  # with:  grep ADMIN_PASSWORD ~/RupRao/.env
  # SITE / EMAIL can be passed in:  SITE=photos.example.com EMAIL=you@example.com bash gcp-setup.sh
  SITE=${SITE:-${IP:+${IP//./-}.sslip.io}}
  rnd() { openssl rand -hex "$1"; }
  PG=$(rnd 16)
  MINIO=$(rnd 16)
  sed -e "s|^SITE_ADDRESS=.*|SITE_ADDRESS=${SITE:-localhost}|" \
      -e "s|^CADDY_TLS=.*|CADDY_TLS=${EMAIL:-internal}|" \
      -e "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=$(rnd 12)|" \
      -e "s|^AUTH_SECRET=.*|AUTH_SECRET=$(rnd 32)|" \
      -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$PG|" \
      -e "s|^DATABASE_URL=.*|DATABASE_URL=postgresql+psycopg://photo_user:$PG@postgres:5432/photo_db|" \
      -e "s|^MINIO_ROOT_PASSWORD=.*|MINIO_ROOT_PASSWORD=$MINIO|" \
      -e "s|^S3_SECRET_KEY=.*|S3_SECRET_KEY=$MINIO|" \
      "$DIR/.env.example" > "$DIR/.env"
  chmod 600 "$DIR/.env"
  echo "  created with random passwords · site: ${SITE:-localhost} · TLS: ${EMAIL:-internal (set CADDY_TLS to an e-mail for a real certificate)}"
else
  echo "  kept the existing one"
fi

echo
echo "✓ Done. Next:"
echo "  1. exit, then ssh in again (so 'docker' works without sudo)"
echo "  2. check ~/RupRao/.env  (SITE_ADDRESS, CADDY_TLS) — admin password: grep ADMIN_PASSWORD ~/RupRao/.env"
echo "  3. cd ~/RupRao && docker compose -f docker-compose.yml -f docker-compose.gcp.yml up -d --build"
