# @dom-bars/api

Backend NestJS da plataforma PDV.

## Rodar em desenvolvimento

A partir da raiz do monorepo:

```bash
docker compose up        # sobe postgres + redis + api
# ou, sem docker, apenas a API (precisa de postgres/redis acessíveis):
pnpm install
pnpm --filter @dom-bars/api dev
```

## Endpoints

- `GET /health` → `{ "status": "ok", "service": "dom-bars-pdv-api", "timestamp": "..." }`

## Testes

```bash
pnpm --filter @dom-bars/api test
```

> Módulos de domínio (auth, caixa, produtos, comandas, vendas, etc.) chegam a
> partir da Fase 1. Ver roadmap em `PLAN.md`.
