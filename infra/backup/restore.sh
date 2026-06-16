#!/usr/bin/env bash
# Restaura um backup gerado por backup.sh. TESTE este fluxo antes de precisar dele.
# Uso: ./restore.sh /var/backups/pdv/pdv-AAAAMMDD-HHMMSS.sql.gz
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a

PG_CONTAINER="${PG_CONTAINER:-infra-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-pdv}"
POSTGRES_DB="${POSTGRES_DB:-pdv}"

FILE="${1:?Informe o arquivo .sql.gz}"
[ -f "$FILE" ] || { echo "Arquivo não encontrado: $FILE"; exit 1; }

echo "ATENÇÃO: isto sobrescreve o banco '$POSTGRES_DB'. Ctrl-C para abortar."
sleep 5

gunzip -c "$FILE" | docker exec -i "$PG_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
echo "[$(date -Is)] Restore concluído a partir de $FILE"
