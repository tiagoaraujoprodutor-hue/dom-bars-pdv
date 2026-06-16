# CLAUDE.md — Convenções do projeto

Guia para o agente (e humanos) trabalharem neste repositório. Mantenha-o
atualizado conforme o projeto evolui.

## O que é este projeto

Plataforma SaaS de PDV para eventos e bares: painel admin web em tempo real,
app Android (Smart 2) offline-first e backend multiempresa/multievento.
Detalhes de arquitetura, decisões e roadmap em **`PLAN.md`**.

## Estrutura (monorepo)

```
/apps/api     → NestJS + Prisma + PostgreSQL + Redis + WebSocket
/apps/web     → Next.js (App Router) + TypeScript
/apps/pos     → React Native (Expo dev client) — Smart 2
/packages/shared → tipos, Zod, contratos, enums, regras compartilhadas
/packages/ui     → design system
/infra        → docker-compose, deploy, backups
```

## Como rodar (dev)

```bash
docker compose up      # sobe postgres + redis + api (api aplica migrations no start)
pnpm install           # instala dependências do monorepo
pnpm dev               # sobe todos os apps em modo dev
```

Healthcheck da API: `GET /health`.

### Banco (Prisma) — em `apps/api`

```bash
# DATABASE_URL aponta para o Postgres (ver .env.example)
pnpm --filter @dom-bars/api prisma:generate   # gera o client
pnpm --filter @dom-bars/api prisma:migrate    # cria/aplica migrations (dev)
pnpm --filter @dom-bars/api prisma:deploy      # aplica migrations (prod/CI)
pnpm --filter @dom-bars/api prisma:seed        # popula empresa/evento/usuários demo
```

Credenciais demo (seed): usuários `operador@demo.com`, `supervisor@demo.com`,
`admin@demo.com` (senha `senha123`); senha admin do evento: `admin123`.

> Migrations especiais escritas em SQL puro (ex.: trigger append-only de auditoria)
> ficam em `apps/api/prisma/migrations/*` com timestamp posterior ao `init`.

### Testes (integração com banco)

Os testes e2e usam um Postgres real (banco `pdv_test`). Configure `DATABASE_URL`
para o banco de teste; o `globalSetup` do Jest roda `prisma migrate deploy` antes da suíte.

```bash
DATABASE_URL=postgresql://pdv:pdv@127.0.0.1:5432/pdv_test pnpm --filter @dom-bars/api test
```

## Como testar

```bash
pnpm test              # roda todos os testes
pnpm lint              # checagem de lint
pnpm build             # build de todos os apps
```

**Toda funcionalidade nasce com teste.** Regras críticas (RBAC, senha admin,
caixa, estoque/insumos, pagamentos, auditoria, idempotência de venda) têm
cobertura obrigatória.

## Convenções de código

- **TypeScript** em todo o stack. `strict: true`.
- **Validação com Zod** em toda fronteira (entrada de API, contratos shared).
- **Tipos e contratos compartilhados** vivem em `packages/shared` — não duplicar entre apps.
- **Nomes de domínio em português** quando forem termos do negócio (comanda, sangria,
  suprimento, cortesia, ficha técnica); código/identificadores técnicos em inglês.
- Mensagens de erro ao usuário: **em português, humanas e acionáveis**.
- Lint/format: ESLint + Prettier (config compartilhada na raiz).

## Padrão de commits (Conventional Commits)

```
feat(api): adiciona abertura de caixa
fix(pos): corrige duplicidade de venda no sync
chore(infra): adiciona backup diário do postgres
test(api): cobre RBAC de sangria
docs: atualiza PLAN.md com decisão de hospedagem
```

Escopos comuns: `api`, `web`, `pos`, `shared`, `ui`, `infra`, `ci`.

## Regras de trabalho do agente (do briefing)

1. **Planejar antes de codar.** Trabalhar **fase por fase**; ao fim de cada fase:
   testes verdes, lint limpo, build verde, commit, resumo e **PARAR para aprovação**.
2. **Verificar versões estáveis atuais** no registry antes de instalar dependências.
3. **Nunca** apagar dados/migrations/arquivos de terceiros sem perguntar.
4. **Documentar enquanto constrói** (README por app + Swagger na API).
5. Decisões/trade-offs relevantes → registrar em `PLAN.md`.

## Guardrails (não faça)

- Não confiar no frontend para permissão ou escopo de evento.
- Não acoplar regra de negócio a um provedor de pagamento.
- Não implementar sync manual se uma engine madura (PowerSync) resolve melhor.
- Não permitir venda sem caixa aberto, nem cortesia/sangria sem senha admin + justificativa.
- Não permitir exclusão de auditoria (append-only).
- Não avançar de fase sem testes verdes e aprovação.

## Branch

Desenvolvimento na branch designada da sessão. Não fazer push para outras branches sem permissão.
```
