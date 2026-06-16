# dom-bars-pdv

Plataforma SaaS de **PDV para eventos e bares**: painel admin web em tempo real,
app Android (Smart 2) offline-first e backend multiempresa/multievento, com
operação de até 15 terminais simultâneos por evento.

> Arquitetura, decisões técnicas e roadmap por fases em **[`PLAN.md`](./PLAN.md)**.
> Convenções de desenvolvimento em **[`CLAUDE.md`](./CLAUDE.md)**.

## Estrutura (monorepo Turborepo + pnpm)

```
/apps/api          → NestJS + Prisma + PostgreSQL + Redis + WebSocket
/apps/web          → Next.js (App Router) — painel admin  (próximas fases)
/apps/pos          → React Native (Expo) — terminais Smart 2  (próximas fases)
/packages/shared   → tipos, schemas Zod, contratos e enums compartilhados
/packages/ui       → design system  (próximas fases)
/infra             → deploy, backups, checklist de evento
```

## Começando (desenvolvimento)

Pré-requisitos: Node 22+, pnpm 10+, Docker.

```bash
cp .env.example .env
docker compose up        # sobe postgres + redis + api
```

A API responde em `http://localhost:3000/health`.

Sem Docker (apenas os apps Node):

```bash
pnpm install
pnpm dev                 # turbo: sobe todos os apps em modo dev
```

## Comandos do monorepo

```bash
pnpm build               # build de todos os pacotes/apps
pnpm test                # testes
pnpm lint                # lint
pnpm format              # prettier --write
```

## Status

- **Fase 0 — Fundação** ✅ monorepo, Docker Compose, CI, lint/format, healthcheck.
- **Fase 1 — Modelagem + Auth + Multi-tenant + Auditoria** ✅ schema Prisma completo,
  migrations, RBAC, JWT+refresh com rotação, senha admin por evento, auditoria
  append-only (trigger no banco) e seed. 14 testes verdes.

Próxima: **Fase 2** (núcleo operacional — caixa, produtos, estoque, ficha técnica,
comandas, vendas, pagamentos). Ver [`PLAN.md`](./PLAN.md).
