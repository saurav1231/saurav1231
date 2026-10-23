#!/usr/bin/env bash
# Daily DB backup, keeps 14 days. Add to crontab (crontab -e):
#   30 2 * * * bash /var/www/ayana/deploy/backup-db.sh >> /var/www/ayana/logs/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
DIR=${BACKUP_DIR:-$HOME/backups}
mkdir -p "$DIR"
# Read DATABASE_URL from server/.env: mysql://user:pass@host:port/db
URL=$(grep -E '^DATABASE_URL=' server/.env | cut -d= -f2- | tr -d '"')
PROTO_STRIPPED=${URL#mysql://}
USERPASS=${PROTO_STRIPPED%@*}; HOSTDB=${PROTO_STRIPPED#*@}
DB_USER=${USERPASS%%:*}; DB_PASS=${USERPASS#*:}
HOSTPORT=${HOSTDB%%/*}; DB_NAME=${HOSTDB#*/}; DB_NAME=${DB_NAME%%\?*}
DB_HOST=${HOSTPORT%%:*}; DB_PORT=${HOSTPORT#*:}; [ "$DB_PORT" = "$HOSTPORT" ] && DB_PORT=3306

FILE="$DIR/ayana-$(date +%F-%H%M).sql.gz"
MYSQL_PWD="$DB_PASS" mysqldump -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" --single-transaction --routines "$DB_NAME" | gzip > "$FILE"
# Uploaded photos live on disk, not in the database, so back them up too.
if [ -d server/uploads ]; then
  tar czf "$DIR/ayana-uploads-$(date +%F-%H%M).tgz" -C server uploads
fi
find "$DIR" \( -name 'ayana-*.sql.gz' -o -name 'ayana-uploads-*.tgz' \) -mtime +14 -delete
echo "$(date) backup written: $FILE"
