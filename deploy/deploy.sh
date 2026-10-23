#!/usr/bin/env bash
# Build and (re)start Ayana. Run on the VPS from the repo root as the app user:
#   cd /var/www/ayana && bash deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

git pull --ff-only

echo "-> API dependencies + database migrations"
(cd server && npm ci && npx prisma migrate deploy)

echo "-> Frontend build"
(cd client && npm ci && npm run build)

mkdir -p logs
if pm2 describe ayana-api >/dev/null 2>&1; then
  pm2 reload deploy/ecosystem.config.cjs
else
  pm2 start deploy/ecosystem.config.cjs
  pm2 save
fi
echo "-> Done. Check: curl -s http://127.0.0.1:4000/api/health"
