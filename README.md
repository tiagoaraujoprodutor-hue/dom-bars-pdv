# dom-bars-pdv

Plataforma SaaS de **PDV para eventos e bares**: painel admin web em tempo real,
app Android (Smart 2) offline-first e backend multiempresa/multievento, com
operação de até 15 terminais simultâneos por evento.

> Arquitetura, decisões técnicas e roadmap por fases em **[`PLAN.md`](./PLAN.md)**.
> Convenções de desenvolvimento em **[`CLAUDE.md`](./CLAUDE.md)**.

## Estrutura (monorepo Turborepo + pnpm)

```
/apps/api          → NestJS + Prisma + PostgreSQL + Redis + WebSocket
/apps/web          → Next.js (App Router) — painel admin tempo real
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
  append-only (trigger no banco) e seed.
- **Fase 2 — Núcleo operacional (API)** ✅ caixa (abertura/fechamento/sangria/suprimento),
  produtos/estoque, ficha técnica + baixa de insumos, perdas, comandas (QR), vendas
  (idempotentes), abstração de pagamentos (Strategy), taxa de serviço, cortesia/reembolso.
  **Swagger em `/docs`**.
- **Fase 3 — Painel web tempo real** ✅ Next.js (App Router): login, lista de eventos,
  **wizard de criação de evento**, gestão de produtos/usuários e **dashboard WebSocket**
  com FATURAMENTO BRUTO em destaque + indicador online/offline.
- **Fase 4 — Relatórios & fechamento** ✅ 11 relatórios em **PDF** (caixa, vendas por
  operador/máquina/produto, pagamentos, cortesias, reembolsos, sangrias, perdas, estoque,
  geral) e **fechamento automático do evento** (consolida + audita). 44 testes verdes.

Próxima: **Fase 5** (app POS Android — React Native). Ver [`PLAN.md`](./PLAN.md).
