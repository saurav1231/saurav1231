#!/usr/bin/env bash
# One-time setup of a fresh Hostinger VPS (Ubuntu 22.04/24.04). Run as root:
#   bash setup-vps.sh ayana.travel you@email.com
set -euo pipefail
DOMAIN=${1:?usage: setup-vps.sh <domain> <email>}
EMAIL=${2:?usage: setup-vps.sh <domain> <email>}
DB_PASS=$(openssl rand -hex 16)

apt-get update && apt-get -y upgrade
apt-get install -y curl git nginx mariadb-server ufw certbot python3-certbot-nginx

# Node.js 22 LTS + PM2
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
npm install -g pm2

# Firewall: only SSH, HTTP, HTTPS. MySQL stays private.
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable

# Database + user (MariaDB listens on 127.0.0.1 by default)
mysql -e "CREATE DATABASE IF NOT EXISTS ayana CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -e "CREATE USER IF NOT EXISTS 'ayana'@'localhost' IDENTIFIED BY '${DB_PASS}';"
mysql -e "GRANT ALL PRIVILEGES ON ayana.* TO 'ayana'@'localhost'; FLUSH PRIVILEGES;"

# App user and folder
id -u ayana &>/dev/null || adduser --disabled-password --gecos "" ayana
mkdir -p /var/www/ayana && chown ayana:ayana /var/www/ayana

echo
echo "================================================================"
echo " Database URL (put this in /var/www/ayana/server/.env):"
echo "   DATABASE_URL=\"mysql://ayana:${DB_PASS}@localhost:3306/ayana\""
echo "================================================================"
echo " Next: clone the repo into /var/www/ayana as user 'ayana', create"
echo " server/.env, run deploy/deploy.sh, then:"
echo "   cp /var/www/ayana/deploy/nginx.conf /etc/nginx/sites-available/ayana"
echo "   sed -i 's/ayana.travel/${DOMAIN}/g' /etc/nginx/sites-available/ayana"
echo "   ln -sf /etc/nginx/sites-available/ayana /etc/nginx/sites-enabled/ayana"
echo "   rm -f /etc/nginx/sites-enabled/default && nginx -t && systemctl reload nginx"
echo "   certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} -m ${EMAIL} --agree-tos -n"
echo "================================================================"
