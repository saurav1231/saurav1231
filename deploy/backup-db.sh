#!/usr/bin/env bash
# Daily backup of the database and uploaded photos, keeps 14 days. Add to crontab (crontab -e):
#   30 2 * * * bash /var/www/ayana/deploy/backup-db.sh >> /var/www/ayana/logs/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
DIR=${BACKUP_DIR:-$HOME/backups}
mkdir -p "$DIR"
# DATABASE_URL in api/.env looks like mysql+pymysql://user:pass@host:port/db
URL=$(grep -E '^DATABASE_URL=' api/.env | cut -d= -f2- | tr -d '"')
REST=${URL#*://}
USERPASS=${REST%@*}; HOSTDB=${REST#*@}
DB_USER=${USERPASS%%:*}; DB_PASS=${USERPASS#*:}
HOSTPORT=${HOSTDB%%/*}; DB_NAME=${HOSTDB#*/}; DB_NAME=${DB_NAME%%\?*}
DB_HOST=${HOSTPORT%%:*}; DB_PORT=${HOSTPORT#*:}; [ "$DB_PORT" = "$HOSTPORT" ] && DB_PORT=3306

STAMP=$(date +%F-%H%M)
MYSQL_PWD="$DB_PASS" mysqldump -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" --single-transaction --routines "$DB_NAME" | gzip > "$DIR/ayana-$STAMP.sql.gz"
# Uploaded photos live on disk, not in the database
if [ -d api/uploads ]; then
  tar czf "$DIR/ayana-uploads-$STAMP.tgz" -C api uploads
fi
find "$DIR" \( -name 'ayana-*.sql.gz' -o -name 'ayana-uploads-*.tgz' \) -mtime +14 -delete
echo "$(date) backup written: $DIR/ayana-$STAMP.sql.gz"
