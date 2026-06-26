#!/usr/bin/env bash
# deploy.sh — bare metal deploy, run on the VPS as the deploy user
# Usage:  ./deploy/deploy.sh [--skip-frontend] [--skip-backend]
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WEB_ROOT="/var/www/reviewhub"
API_URL="${API_URL:-https://api.bdranks.com/api/v1}"
SERVICE_NAME="bdranks-api"

SKIP_FRONTEND=false
SKIP_BACKEND=false

for arg in "$@"; do
  case $arg in
    --skip-frontend) SKIP_FRONTEND=true ;;
    --skip-backend)  SKIP_BACKEND=true  ;;
  esac
done

echo "==> Pulling latest code"
git -C "$REPO_DIR" pull

# ── Backend ───────────────────────────────────────────────────────────────────
if [ "$SKIP_BACKEND" = false ]; then
  echo "==> Building Go binary"
  cd "$REPO_DIR/be"
  go build -o server ./cmd/server

  echo "==> Restarting API service"
  sudo systemctl restart "$SERVICE_NAME"
  sudo systemctl status "$SERVICE_NAME" --no-pager
fi

# ── Frontend ──────────────────────────────────────────────────────────────────
if [ "$SKIP_FRONTEND" = false ]; then
  echo "==> Building frontend (fe/)"
  cd "$REPO_DIR/fe"
  echo "VITE_API_BASE_URL=$API_URL" > .env.production
  echo "VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID:-}" >> .env.production
  echo "VITE_FACEBOOK_APP_ID=${VITE_FACEBOOK_APP_ID:-}" >> .env.production
  npm ci --silent
  npm run build

  echo "==> Building CMS (cms/)"
  cd "$REPO_DIR/cms"
  echo "VITE_API_BASE_URL=$API_URL" > .env.production
  npm ci --silent
  npm run build

  echo "==> Copying static files to $WEB_ROOT"
  sudo mkdir -p "$WEB_ROOT/fe" "$WEB_ROOT/cms"
  sudo rsync -a --delete "$REPO_DIR/fe/dist/"  "$WEB_ROOT/fe/"
  sudo rsync -a --delete "$REPO_DIR/cms/dist/" "$WEB_ROOT/cms/"
  sudo chown -R www-data:www-data "$WEB_ROOT"

  echo "==> Reloading Nginx"
  sudo nginx -t && sudo systemctl reload nginx
fi

echo "==> Done."
