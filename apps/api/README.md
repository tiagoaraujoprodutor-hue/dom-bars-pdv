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

### Núcleo operacional (Fase 2)

- **Produtos/estoque**: `GET/POST /events/:id/products`, `PATCH /products/:id`,
  `categories`, `ingredients`, `PUT /products/:id/recipe` (ficha técnica),
  `POST /inventory/adjust`, `GET /inventory/low-stock`.
- **Caixa**: `POST /cash-registers/open`, `:id/close`, `:id/sangria`, `:id/suprimento`,
  `GET current`, `:id/summary`.
- **Comandas**: `POST /tabs`, `GET /tabs/:code`, `POST /tabs/:id/items`, `:id/close`.
- **Vendas**: `POST /sales` (idempotente por `clientId`), `GET /sales`, `:id`,
  `POST /sales/:id/cancel` (estorno).
- **Perdas**: `GET/POST /events/:id/losses`.
- **Cortesias**: `GET/POST /events/:id/courtesies`.
- **Config do evento**: `GET/PATCH /events/:id/config` (taxa de serviço).
- **Dashboard/Tempo real**: `GET /events/:id/dashboard`; WebSocket `/events` (`dashboard:update`).
- **Usuários**: `GET/POST /events/:id/users`. **Wizard**: `GET/POST /events`.
- **Atendentes (login por CPF, senha com validade por evento — admin):**
  `GET/POST /events/:id/attendants`, `PATCH /events/:id/attendants/:userId`
  (ativar/desativar, redefinir senha, definir validade). Login: `POST /auth/login`
  aceita `{ email }` (admin) ou `{ cpf }` (atendente) + `password`.
- **Relatórios PDF**: `GET /events/:id/reports/{general,cash/:registerId,sales-by-operator,
  sales-by-machine,sales-by-product,payments,courtesies,refunds,cash-movements,losses,stock}`.
- **Fechamento do evento**: `POST /events/:id/close` (admin + senha admin).

Documentação interativa (Swagger): **`/docs`** (OpenAPI JSON em `/docs-json`).

**Regras críticas garantidas:** sem caixa aberto não há venda; baixa de estoque/insumos
na venda; idempotência de venda offline; taxa de serviço no fechamento da comanda;
sangria/suprimento/cortesia/estorno exigem perfil Administrador + senha admin.

## Banco e testes

Ver instruções de Prisma (migrate/seed) e dos testes de integração em `CLAUDE.md`.

```bash
pnpm --filter @dom-bars/api test   # requer Postgres (banco pdv_test) — ver CLAUDE.md
```

> Próxima fase: painel web em tempo real (WebSocket) e dashboard. Ver `PLAN.md`.
