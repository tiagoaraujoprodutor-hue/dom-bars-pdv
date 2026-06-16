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

## Endpoints (Fase 1)

- `GET  /health` → status do serviço.
- `POST /auth/login` → `{ email, password, machineId? }` → `{ accessToken, refreshToken, user }`.
- `POST /auth/refresh` → `{ refreshToken }` → novo par (rotação).
- `POST /auth/logout` → `{ refreshToken }` (Bearer) → revoga.
- `GET  /auth/me` → usuário autenticado + memberships.
- `GET  /events/:eventId/membership` → papel do usuário no evento (qualquer membro).
- `GET  /events/:eventId/reports` → Supervisor/Administrador.
- `POST /events/:eventId/admin-action` → Administrador + senha admin → grava auditoria.

Toda rota de evento é protegida por `JwtAuthGuard → EventScopeGuard → RolesGuard`
(isolamento multi-tenant + RBAC). Ações críticas exigem senha admin do evento.

## Banco e testes

Ver instruções de Prisma (migrate/seed) e dos testes de integração em `CLAUDE.md`.

```bash
pnpm --filter @dom-bars/api test   # requer Postgres (banco pdv_test) — ver CLAUDE.md
```

> Módulos de domínio operacional (caixa, produtos, comandas, vendas, pagamentos)
> chegam na Fase 2. Ver roadmap em `PLAN.md`.
