# Backup & Restore do Postgres

- `backup.sh` — `pg_dump` comprimido, valida o gzip e aplica retenção (14 dias).
- `restore.sh <arquivo.sql.gz>` — restaura um backup (sobrescreve o banco).

## Agendar (cron, diário às 05:00)

```bash
crontab -e
0 5 * * * /opt/dom-bars-pdv/infra/backup/backup.sh >> /var/log/pdv-backup.log 2>&1
```

Coloque um `infra/backup/.env` com `PG_CONTAINER`, `POSTGRES_USER`, `POSTGRES_DB`,
`BACKUP_DIR`, `RETENTION_DAYS` se os defaults não servirem.

## Restore testado (faça isto ANTES do evento)

```bash
./restore.sh /var/backups/pdv/pdv-AAAAMMDD-HHMMSS.sql.gz
# valide no painel/Swagger que os dados voltaram
```

> Guarde cópias **fora do VPS** (object storage/Drive). Um backup só vale se o
> restore foi testado.
