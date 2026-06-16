# PLAN.md — Plataforma PDV para Eventos & Bares

> Documento vivo de arquitetura e roadmap. Toda decisão técnica relevante e
> todo trade-off resolvido é registrado aqui (regra de trabalho nº 7 do briefing).

**Status atual:** Fase 0 — Fundação (planejamento). Aguardando aprovação para iniciar Fase 1.

---

## 1. Visão e critérios inegociáveis

Plataforma SaaS de PDV para eventos e bares, com painel admin web em tempo real,
app Android (Smart 2) offline-first, backend multiempresa/multievento e operação
de até **15 terminais simultâneos por evento**.

Dois critérios acima de qualquer feature:

1. **Confiabilidade sob pressão de evento** — não cai, não perde venda, funciona sem internet.
2. **Facilidade de operação** — qualquer pessoa opera; deploy e manutenção por uma pessoa só.

Regra de ouro do offline: **uma venda registrada offline nunca pode ser perdida nem duplicada** ao sincronizar.

---

## 2. Arquitetura (monorepo)

```
/apps
  /api        → NestJS + Prisma + PostgreSQL + Redis + WebSocket Gateway
  /web        → Next.js (App Router) + TypeScript — painel admin tempo real
  /pos        → React Native (Expo dev client) — terminais Smart 2, offline-first
/packages
  /shared     → tipos TS, schemas Zod, contratos de API, enums, regras compartilhadas
  /ui         → design system (web + tokens)
/infra        → docker-compose, scripts de deploy, IaC, backups
```

**Gerenciamento:** Turborepo + pnpm workspaces. Operação por comando único.

**Isolamento multi-tenant:** todo dado pertence a um `eventId`, e este a uma
`companyId`. Banco único PostgreSQL, tenant-por-coluna. O escopo é aplicado em
**camada de serviço + guard** (nunca confiando no frontend). Nenhuma query
cruza eventos sem permissão explícita.

---

## 3. Stack e versões

> Versões verificadas no registry npm em **2026-06-16**. Serão reconfirmadas no
> momento da instalação de cada app (regra de trabalho nº 3).

| Camada | Tecnologia | Versão alvo |
|---|---|---|
| Monorepo | Turborepo + pnpm | turbo `2.9.x`, pnpm `9.x` |
| Backend | NestJS | `11.x` |
| ORM | Prisma | `7.x` |
| Banco | PostgreSQL | `16` |
| Cache/Filas | Redis + BullMQ | redis `7`, bullmq `5.x` |
| Tempo real | WebSocket (NestJS Gateway / socket.io) | namespaces por evento |
| Auth | JWT + Refresh Token (argon2) | — |
| Web | Next.js + TypeScript | `16.x` |
| Mobile | React Native via Expo (dev client / prebuild) | Expo SDK `56` |
| Offline/Sync | **PowerSync** (decisão — ver §5) | `@powersync/react-native 1.35.x` |
| Validação | Zod (em toda fronteira) | `3.x` |
| Contêineres | Docker + Docker Compose | — |
| Deploy | **Coolify em 1 VPS** (decisão — ver §6) | — |

---

## 4. Decisões técnicas registradas (ADRs resumidas)

### ADR-01 — Tenant-por-coluna em banco único
Isolamento por `eventId`/`companyId` em coluna, com guard de escopo obrigatório
no service layer. **Alternativa descartada:** schema/DB por tenant (operação mais
cara para eventos intermitentes, migrations multiplicadas). Mitigação de risco:
testes automáticos que provam que nenhuma query cruza eventos.

### ADR-02 — Auditoria append-only
Tabela `AuditLog` sem update/delete a nível de aplicação. Idealmente reforçado no
banco com `REVOKE UPDATE, DELETE` para o role da aplicação + trigger que bloqueia.
Cada ação crítica grava: usuário, máquina, evento, data/hora, ação, valor.

### ADR-03 — Abstração de pagamentos (Strategy)
Interface `PaymentProvider` com implementações plugáveis (dinheiro/PIX/cartão/cortesia
manuais hoje; PagBank/PlugPag no futuro). Regra de negócio nunca acoplada a provedor.

### ADR-04 — Idempotência de vendas
Toda venda carrega um `clientId` (UUID gerado no terminal). O backend faz upsert
idempotente por `clientId`, garantindo zero duplicidade na sincronização. Base da
regra de ouro do offline.

---

## 5. Engine de offline/sync — DECIDIDO: PowerSync ✅

**Decisão confirmada (2026-06-16): PowerSync** (primário), conforme o briefing sugere.

| Critério | PowerSync | WatermelonDB |
|---|---|---|
| Sync Postgres↔SQLite | Engine pronta (CDC/replicação lógica) | Você implementa o protocolo de sync |
| Resolução de conflitos | Regras declarativas + server authority | Manual no seu backend |
| Esforço de manutenção | Baixo (serviço dedicado) | Alto (sync caseiro) |
| Custo/infra | Serviço PowerSync (cloud) ou self-host | Zero extra |
| Aderência ao guardrail | "não implemente sync manual se engine madura resolve" ✅ | reinventa a roda ⚠️ |

**Trade-off:** PowerSync adiciona um componente de infra (serviço de sync +
replicação lógica no Postgres). Em troca, elimina a parte mais arriscada do projeto
(sync manual com conflitos). Para 15 terminais e a regra de ouro de "zero perda/zero
duplicidade", o risco de um sync caseiro não compensa.

Detalhes de implementação serão definidos na Fase 6.

---

## 6. Hospedagem — DECIDIDO: Coolify em 1 VPS ✅

**Decisão confirmada (2026-06-16): Coolify em 1 VPS** (Hetzner ou DigitalOcean).

- PaaS self-hosted: deploys, SSL automático, Postgres/Redis gerenciados, baixo custo.
- Eventos são intermitentes → custo previsível e baixo importa.
- **Trade-off:** você administra o VPS (mitigado por backups diários + restore testado + observabilidade).
- **Alternativa:** Railway/Render (zero infra, custo maior em escala) caso prefira não administrar VPS.

Entregáveis de deploy: `.env.example` versionado, secrets fora do git, migrations
automáticas no deploy, **backup diário do Postgres** com restore testado, healthchecks,
logs centralizados e `CHECKLIST_DIA_DE_EVENTO.md`.

Detalhes de deploy serão definidos na Fase 7.

---

## 7. RBAC (matriz de permissões)

| Ação | Operador | Supervisor | Administrador |
|---|---|---|---|
| Abrir comanda / lançar produto / receber pagamento | ✅ | ✅ | ✅ |
| Consultar estoque disponível | ✅ | ✅ | ✅ |
| Acompanhar operação / relatórios operacionais | ❌ | ✅ | ✅ |
| Cancelar venda / Reembolso | ❌ | ❌ | ✅ |
| Cortesia | ❌ | ❌ | ✅ |
| Sangria / Suprimento | ❌ | ❌ | ✅ |
| Estoque / Config evento / Cadastrar usuário / Encerrar evento | ❌ | ❌ | ✅ |

**Senha admin por evento** obrigatória para: sangria, suprimento, cortesia, reembolso
e alterações críticas. Toda ação → auditoria.

---

## 8. Roadmap por fases (checkpoint de aprovação ao fim de cada uma)

- [x] **Fase 0 — Fundação:** monorepo, Docker Compose, CI, lint/format, `CLAUDE.md`, `PLAN.md`, healthcheck.
      **DoD:** `docker compose up` sobe banco/redis/api e responde `/health`.
- [ ] **Fase 1 — Modelagem + Auth + Multi-tenant + Auditoria:** schema Prisma completo,
      migrations, RBAC, JWT+refresh, senha admin por evento, auditoria append-only, seed.
      **DoD:** login dos 3 perfis, escopo por evento garantido por teste, auditoria gravando.
- [ ] **Fase 2 — Núcleo operacional (API):** caixa, produtos, estoque, ficha técnica +
      baixa de insumos, perdas, comandas (QR), vendas, abstração de pagamentos, taxa de
      serviço, cortesia/reembolso. Swagger. **DoD:** ciclo completo de venda via API com testes.
- [ ] **Fase 3 — Painel web tempo real:** auth, gestão de evento/produtos/usuários, wizard
      de criação de evento, dashboard WebSocket com faturamento bruto em destaque.
      **DoD:** dashboard reflete vendas em tempo real.
- [ ] **Fase 4 — Relatórios & fechamento:** PDFs e fechamento automático do evento.
      **DoD:** todos os relatórios saem em PDF.
- [ ] **Fase 5 — App POS (online):** RN dev client, venda em 2–3 toques, comandas/QR,
      impressão via SDK nativo do Smart 2. **DoD:** vender e imprimir de um Smart 2.
- [ ] **Fase 6 — Offline & sync:** SQLite local, operação offline total, sync automático,
      resolução de conflitos, fila. **DoD:** vender offline em 2 terminais, reconectar, zero perda/zero duplicidade.
- [ ] **Fase 7 — Hardening & Deploy:** teste de carga (15 terminais), revisão de segurança,
      backups, observabilidade, produção + checklist de dia de evento. **DoD:** sistema no ar, deploy reproduzível.

---

## 9. Estratégia de testes

- **Toda funcionalidade nasce com teste.** Cobertura obrigatória para regras críticas:
  permissões (RBAC + senha admin), caixa, estoque/insumos, pagamentos, auditoria, idempotência de venda.
- Backend: Jest (unit + e2e com banco de teste).
- Shared: testes de schemas Zod e regras puras.
- Gate por fase: testes verdes + lint limpo + build verde antes do checkpoint.

---

## 10. Riscos principais e mitigação

| Risco | Mitigação |
|---|---|
| Perda/duplicação de venda no sync | `clientId` idempotente + engine PowerSync + teste de cenário offline 2 terminais |
| Vazamento entre eventos (tenant) | Guard de escopo + testes que provam isolamento |
| Adulteração de auditoria | Append-only na app + REVOKE/trigger no banco |
| Acoplamento a provedor de pagamento | Strategy `PaymentProvider` |
| Impressão falhando no evento | Fila resiliente (BullMQ online / fila local offline) + plano B no checklist |
| Operação difícil sob pressão | UI 2–3 toques, indicador online/offline, seed realista, wizard de evento |
```
