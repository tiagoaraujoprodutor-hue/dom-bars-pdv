# Manual de Instalação (deploy)

Para quem vai colocar o sistema no ar. Caminho recomendado: **Coolify em 1 VPS**
(ver PLAN §8). Há também o `docker compose` de produção para self-host direto.

## Pré-requisitos
- 1 VPS Linux (2 vCPU / 4 GB já atendem um evento médio) — Hetzner/DigitalOcean.
- Domínio apontando para o VPS (ex.: `api.seu-dominio.com`, `painel.seu-dominio.com`).
- Docker + Docker Compose no servidor.

## Opção A — Coolify (recomendado)
1. Instale o Coolify no VPS (script oficial). Acesse o painel.
2. Conecte este repositório (deploy por Git).
3. Crie 3 recursos: **Postgres**, **Redis** e a **API** (Dockerfile em `apps/api`).
   Crie também o **Web** (Dockerfile em `apps/web`, context = raiz).
4. Configure as variáveis de ambiente (ver `infra/.env.prod.example`):
   `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `NEXT_PUBLIC_API_URL`.
5. Ative SSL (Let's Encrypt) para os domínios da API e do painel.
6. Deploy. A API **aplica as migrations no start** automaticamente.
7. Rode o seed uma vez (opcional, p/ demo):
   `docker exec <api> npx prisma db seed`.

## Opção B — docker compose (self-host)
```bash
git clone <repo> /opt/dom-bars-pdv && cd /opt/dom-bars-pdv/infra
cp .env.prod.example .env   # preencha os segredos
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
docker compose -f docker-compose.prod.yml ps   # tudo healthy?
curl http://localhost:3000/health
```

## Pós-deploy
- Configure o **backup diário** (`infra/backup/`) no cron e **teste o restore**.
- Aponte `EXPO_PUBLIC_API_URL` dos terminais para a URL pública da API.
- Rode o **teste de carga** (`infra/load-test/`) antes do primeiro evento.
- Siga o `infra/CHECKLIST_DIA_DE_EVENTO.md`.

## Atualizações
- Coolify: novo push → redeploy. Migrations aplicam no start.
- Compose: `git pull && docker compose -f docker-compose.prod.yml up -d --build`.
