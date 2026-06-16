# /infra

Infraestrutura, deploy e backups.

- `docker-compose.yml` (na raiz do repo) sobe o ambiente de **desenvolvimento**
  (postgres + redis + api) com um único comando.
- Esta pasta receberá, nas próximas fases: compose de **produção**, scripts de
  deploy (Coolify), rotina de **backup diário do Postgres** com restore testado,
  e o `CHECKLIST_DIA_DE_EVENTO.md` (Fase 7).

Decisão de hospedagem registrada em `PLAN.md` §6: **Coolify em 1 VPS**.
