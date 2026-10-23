#!/usr/bin/env bash
# One-time setup of a fresh Hostinger VPS (Ubuntu 22.04/24.04). Run as root:
#   bash setup-vps.sh ayana.travel you@email.com
set -euo pipefail
DOMAIN=${1:?usage: setup-vps.sh <domain> <email>}
EMAIL=${2:?usage: setup-vps.sh <domain> <email>}
DB_PASS=$(openssl rand -hex 16)
READ_PASS=$(openssl rand -hex 16)

apt-get update && apt-get -y upgrade
apt-get install -y curl git nginx mariadb-server ufw certbot python3-certbot-nginx python3 python3-venv python3-pip

# Node.js 22 LTS - only used to build the website
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# Firewall: only SSH, HTTP, HTTPS. MySQL, the API (8000) and Insights (8501) stay private.
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable

# Database, the app user, and a read-only user for the analytics dashboards
mysql -e "CREATE DATABASE IF NOT EXISTS ayana CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -e "CREATE USER IF NOT EXISTS 'ayana'@'localhost' IDENTIFIED BY '${DB_PASS}';"
mysql -e "GRANT ALL PRIVILEGES ON ayana.* TO 'ayana'@'localhost';"
mysql -e "CREATE USER IF NOT EXISTS 'ayana_read'@'localhost' IDENTIFIED BY '${READ_PASS}';"
mysql -e "GRANT SELECT ON ayana.* TO 'ayana_read'@'localhost'; FLUSH PRIVILEGES;"

# App user and folder; allow it to restart only its own two services (used by deploy.sh)
id -u ayana &>/dev/null || adduser --disabled-password --gecos "" ayana
mkdir -p /var/www/ayana && chown ayana:ayana /var/www/ayana
cat > /etc/sudoers.d/ayana <<'SUDO'
ayana ALL=(root) NOPASSWD: /usr/bin/systemctl restart ayana-api, /usr/bin/systemctl restart ayana-insights
SUDO
chmod 440 /etc/sudoers.d/ayana

echo
echo "================================================================"
echo " Put these in the .env files after cloning:"
echo "   api/.env        DATABASE_URL=mysql+pymysql://ayana:${DB_PASS}@localhost:3306/ayana"
echo "   analytics/.env  ANALYTICS_DATABASE_URL=mysql+pymysql://ayana_read:${READ_PASS}@localhost:3306/ayana"
echo "================================================================"
echo " Next (see docs/07-cursor-github-hostinger.md):"
echo "   1. as ayana: clone the repo into /var/www/ayana, create api/.env and analytics/.env"
echo "   2. as ayana: bash deploy/deploy.sh   (first run: then  cd api && .venv/bin/python -m scripts.seed)"
echo "   3. as root:  cp /var/www/ayana/deploy/ayana-*.service /etc/systemd/system/ && systemctl daemon-reload"
echo "                systemctl enable --now ayana-api ayana-insights"
echo "   4. as root:  Nginx site + certbot for ${DOMAIN} (${EMAIL})"
echo "================================================================"
