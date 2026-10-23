#!/usr/bin/env bash
# Build and (re)start Ayana. Run on the VPS from the repo root as the app user:
#   cd /var/www/ayana && bash deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

git pull --ff-only

echo "-> API: Python packages + database migrations"
[ -d api/.venv ] || python3 -m venv api/.venv
api/.venv/bin/pip install -q -r api/requirements.txt
(cd api && .venv/bin/alembic upgrade head)

echo "-> Insights (Streamlit) packages"
[ -d analytics/.venv ] || python3 -m venv analytics/.venv
analytics/.venv/bin/pip install -q -r analytics/requirements.txt

echo "-> Website build"
(cd client && npm ci && npm run build)

echo "-> Restart services"
if systemctl list-unit-files | grep -q '^ayana-api'; then
  sudo systemctl restart ayana-api
  sudo systemctl restart ayana-insights
else
  echo "   (services not installed yet - see docs/07-cursor-github-hostinger.md step 7.7)"
fi
echo "-> Done. Check: curl -s http://127.0.0.1:8000/api/health"
