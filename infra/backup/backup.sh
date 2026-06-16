#!/usr/bin/env bash
# Backup diário do Postgres (pg_dump comprimido) com retenção.
# Uso (cron): 0 5 * * *  /caminho/infra/backup/backup.sh >> /var/log/pdv-backup.log 2>&1
#
# Variáveis (ou .env ao lado):
#   PG_CONTAINER  nome do container postgres (default: infra-postgres-1)
#   POSTGRES_USER / POSTGRES_DB
#   BACKUP_DIR    destino (default: /var/backups/pdv)
#   RETENTION_DAYS (default: 14)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a

PG_CONTAINER="${PG_CONTAINER:-infra-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-pdv}"
POSTGRES_DB="${POSTGRES_DB:-pdv}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/pdv}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/pdv-$STAMP.sql.gz"

echo "[$(date -Is)] Iniciando backup -> $OUT"
docker exec "$PG_CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  | gzip -9 > "$OUT"

# Verifica integridade básica do gzip
gzip -t "$OUT"
echo "[$(date -Is)] Backup OK ($(du -h "$OUT" | cut -f1))"

# Retenção
find "$BACKUP_DIR" -name 'pdv-*.sql.gz' -mtime +"$RETENTION_DAYS" -delete
echo "[$(date -Is)] Retenção aplicada (> $RETENTION_DAYS dias removidos)"
