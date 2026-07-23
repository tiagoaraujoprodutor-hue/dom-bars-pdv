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
| ORM | Prisma | `6.x` (ver ADR-05) |
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
regra de ouro do offline. No schema: `Sale @@unique([eventId, clientId])`.

### ADR-05 — Prisma 6.x (em vez de 7.x)
O briefing/PLAN inicial mirava Prisma 7. Adotado **Prisma 6.19.x** por compatibilidade
sólida com o NestJS em CommonJS (o client `prisma-client-js`); o Prisma 7 é ESM-first
e adicionaria atrito de bundling sem ganho funcional nesta fase. Reavaliar em fase de
hardening. **Auditoria append-only** reforçada por trigger no banco
(`migration audit_append_only`), que bloqueia UPDATE/DELETE inclusive para o owner.

### ADR-06 — Validação com Zod (sem class-validator)
Validação de entrada via `ZodValidationPipe` por rota, reutilizando schemas. Evita a
dupla fonte de verdade de DTOs com decorators e alinha com `packages/shared`.

### ADR-07 — Refresh token rotativo
Refresh token é JWT (secret próprio) com `jti` único; persistido como `sha256` em
`RefreshToken`. No refresh há **rotação** (revoga o usado, emite novo par). Logout revoga.

### ADR-08 — Baixa de estoque em ponto único (finalização da venda)
A baixa de estoque/insumos acontece **só na finalização da venda** (`SalesService.finalize`),
reusada por venda avulsa e por fechamento de comanda. Itens adicionados à comanda **não
reservam** estoque; a baixa ocorre no fechamento. Trade-off: simplicidade e uma única
fonte de verdade (sem dupla contagem) em troca de não reservar durante a comanda aberta —
aceitável para o cenário de bar. Produto **com** ficha técnica baixa insumos; **sem** ficha
baixa o próprio estoque. Cancelamento/reembolso estorna pelo mesmo caminho.

### ADR-09 — Idempotência e taxa de serviço
Venda é idempotente por `@@unique([eventId, clientId])`: re-POST com mesmo `clientId`
retorna a venda existente (e trata corrida via P2002). Taxa de serviço é aplicada no
**fechamento da comanda** (e opcionalmente em venda avulsa via flag), conforme o evento.

### ADR-10 — Pagamentos via Strategy
`PaymentProvider` (interface) + `PaymentsService` (registro método→provider).
`ManualPaymentProvider` cobre PIX/crédito/débito/dinheiro/cortesia hoje; PagBank/PlugPag
entram registrando um provider, sem tocar na regra de venda.

### ADR-11 — Tempo real (WebSocket) com publish fire-and-forget
Gateway socket.io no namespace `/events`, salas por evento, conexão autenticada por
JWT + membership. `RealtimeService.publishDashboard` recalcula o snapshot e emite
`dashboard:update` de forma **fire-and-forget** (uma falha de WS nunca quebra a venda).
Dashboard agrega só vendas `CONCLUIDA` (estorno sai do faturamento).

### ADR-12 — Web client-side com tokens no localStorage
Painel Next.js (App Router) em componentes client; tokens JWT no `localStorage` e
chamadas autenticadas via `fetch`. Simples e suficiente para um painel interno; pode
evoluir para cookies httpOnly + middleware SSR em hardening.

### ADR-14 — Offline-first: outbox durável + idempotência (engine testável)
A regra de ouro (uma venda offline **nunca** se perde nem duplica) é implementada com:
**outbox durável** em SQLite no terminal (persiste antes da rede → não perde) +
**idempotência por `clientId`** (`INSERT OR IGNORE` local e upsert por `clientId` no
servidor → não duplica ao reenviar). O `SyncEngine` (em `packages/shared`, **com testes**)
orquestra o flush quando há rede. **Revisão do ADR sobre PowerSync:** o PowerSync segue
recomendado para sincronização **bidirecional de estado compartilhado** (ex.: estado de
comanda em tempo real entre 15 terminais) e pode ser adicionado para o read-side; para o
**write-path de vendas** (o ponto crítico), o outbox + idempotência já garante o requisito
com menos peso operacional e é o que está implementado.

### ADR-17 — Atendentes: login por CPF com credencial por evento
Atendentes logam por **CPF**; a **senha, a validade (`expiresAt`) e o ativo/inativo ficam
na vinculação com o evento** (`EventMembership`), controlados pelo Admin. Assim o mesmo
atendente troca de máquina livremente e o fechamento é rastreado por ele (relatório "por
operador"). Admin/supervisor seguem logando por e-mail (senha global no `User`). Regras:
- Login por CPF valida a senha da membership; se casar mas estiver **expirada/desativada**,
  bloqueia com mensagem clara.
- O `EventScopeGuard` também rejeita membership inativa/expirada — então revogar acesso
  vale na hora, mesmo com token válido.
- `User.email`/`User.passwordHash` viraram opcionais; `User.cpf` único. CPF validado com
  dígitos verificadores.

### ADR-18 — Caixa por atendente (escala 10–30 terminais)
Cada atendente tem o **próprio caixa** no evento (um caixa aberto por atendente por vez):
abre com valor inicial, vende **no seu caixa** (a venda exige o caixa do próprio operador),
e sangrias/suprimentos ficam atribuídos ao caixa dele (`CashRegister.openedById`). O
**fechamento por atendente** concilia: `caixa inicial + vendas em dinheiro + suprimentos −
sangrias = caixa esperado`, com busca por CPF e PDF individual. Ajuste operacional: abertura
de caixa liberada ao próprio operador (antes era supervisor/admin); o POS ganhou tela de
"Abrir caixa". Modelo pensado para 10–30 máquinas, uma por atendente.

### ADR-16 — Rate limit dimensionado por evento (achado do teste de carga)
O teste de carga (15 terminais) revelou que o limite default (100 req/min) barrava o pico
de vendas com 429. Ajustado para **2000 req/min** (configurável por `THROTTLE_LIMIT`), pois
15 terminais sob o mesmo NAT compartilham o IP. Após o ajuste: 300 vendas criadas, 0
duplicatas (60 reenvios idempotentes), ~77 vendas/s, 0 falhas.

### ADR-15 — Impressão desacoplada do SDK
`Printer` (interface em `shared`) com `MockPrinter` (dev) e `NativePrinter` (bridge para
o módulo nativo `Smart2Printer` do terminal). A regra de venda chama `printer.print(job)`
sem conhecer o SDK; o cupom é montado por `buildReceipt` (puro, testado).

### ADR-13 — Relatórios PDF com pdfkit (server-side)
Geração de PDF com **pdfkit** (sem navegador headless): leve, offline, fontes padrão
embutidas. Um renderizador genérico (`renderPdf(spec)`) recebe título + seções (tabelas)
e devolve um `Buffer`, servido como `application/pdf` via `StreamableFile`. Evita o peso
operacional do puppeteer. Fechamento de evento consolida e marca `ENCERRADO`; o relatório
geral fica em `GET /events/:id/reports/general`.

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
- [x] **Fase 1 — Modelagem + Auth + Multi-tenant + Auditoria:** schema Prisma completo,
      migrations, RBAC, JWT+refresh, senha admin por evento, auditoria append-only, seed.
      **DoD:** login dos 3 perfis, escopo por evento garantido por teste, auditoria gravando.
      ✅ 14 testes e2e/unit verdes (login 3 perfis, isolamento A↔B, RBAC, senha admin,
      auditoria gravando, append-only no banco, rotação de refresh).
- [x] **Fase 2 — Núcleo operacional (API):** caixa, produtos, estoque, ficha técnica +
      baixa de insumos, perdas, comandas (QR), vendas, abstração de pagamentos, taxa de
      serviço, cortesia/reembolso. Swagger. **DoD:** ciclo completo de venda via API com testes.
      ✅ 26 testes verdes; Swagger em `/docs`.
- [x] **Fase 3 — Painel web tempo real:** auth, gestão de evento/produtos/usuários, wizard
      de criação de evento, dashboard WebSocket com faturamento bruto em destaque.
      **DoD:** dashboard reflete vendas em tempo real. ✅ Gateway WS + dashboard agregado +
      app Next.js; teste e2e prova `dashboard:update` ao registrar venda (30 testes verdes).
- [x] **Fase 4 — Relatórios & fechamento:** PDFs e fechamento automático do evento.
      **DoD:** todos os relatórios saem em PDF. ✅ 11 relatórios PDF + fechamento de evento; 44 testes.
- [x] **Fase 5 — App POS (online):** RN dev client, venda em 2–3 toques, comandas/QR,
      impressão via SDK nativo do Smart 2. **DoD:** vender e imprimir de um Smart 2.
      ✅ App Expo completo (login, seleção de evento, venda 2–3 toques, comandas). Impressão
      **implementada** para o **Smart POS P2 = Sunmi P2** via biblioteca oficial Sunmi
      (`com.sunmi:printerlibrary`, Maven Central — sem SDK/.aar externo). Validar no device real.
- [x] **Fase 6 — Offline & sync:** SQLite local, operação offline total, sync automático,
      resolução de conflitos, fila. **DoD:** vender offline em 2 terminais, reconectar, zero perda/zero duplicidade.
      ✅ Outbox SQLite + `SyncEngine` idempotente; garantia provada por testes em `shared`
      (51 testes no total). Validação em 2 terminais físicos fica para o PDV real.
- [x] **Fase 7 — Hardening & Deploy:** teste de carga (15 terminais), revisão de segurança,
      backups, observabilidade, produção + checklist de dia de evento. **DoD:** sistema no ar, deploy reproduzível.
      ✅ Teste de carga executado (300 vendas/15 terminais, 0 duplicatas, ~77 v/s); helmet +
      filtro global + rate limit por env; `docker-compose.prod.yml` + Dockerfile web (standalone);
      scripts de backup/restore; `CHECKLIST_DIA_DE_EVENTO.md`, `SECURITY.md`, manuais de
      instalação e operacional. Deploy em produção (Coolify) documentado — a aplicar no VPS.

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

---

## 11. Auditoria antifraude (rodada 2026-07) — decisões

Auditoria de ponta a ponta pensando como quem tentaria desviar dinheiro/mercadoria.
O núcleo já era sólido (preço congelado no servidor — sem sub-cobrança; valores
negativos/NaN barrados; idempotência por `clientId`; escopo por evento/empresa;
auditoria append-only; ações críticas com senha admin + trilha). Correções aplicadas:

- **Senha admin era o único portão e sem proteção de força-bruta** → bloqueio por
  evento com backoff exponencial + auditoria de cada tentativa falha
  (`ADMIN_PASSWORD_FAIL`). NÃO limitamos login por IP de propósito (60 terminais
  dividem o NAT do evento). *(AdminPasswordService)*
- **Ficha (mercadoria) saía mesmo quando o servidor recusava a venda online** →
  venda online agora vai direto ao servidor e só imprime se ACEITA; recusa
  definitiva não imprime. Offline segue durável (nunca perde; servidor recalcula
  preço). *(App.tsx)*
- **`clientId` reusado com conteúdo diferente colapsava duas entregas em uma venda**
  → idempotência ligada ao conteúdo: reenvio idêntico = idempotente; divergente = 409.
- **Conciliação de caixa somava cartão/PIX como dinheiro** → "esperado em gaveta"
  passa a contar só DINHEIRO (+ suprimentos − sangrias). *(CashService.summary)*
- **`machineId` fixo em todos os aparelhos** → id único por terminal (rastreio).
- **Perda de estoque sem senha admin** → passa a exigir senha admin (como sangria).
- **Preço de produto alterado sem trilha** → auditoria `PRODUCT_CREATE`/`PRODUCT_UPDATE`
  (antes/depois de preço e custo).
- **Relatório de atendente vazava nome/CPF de outro evento** → resolve só por membro
  do evento (LGPD).
- **Cancelamento concorrente virava 500** → cancelamento condicional + P2002 → 409.

### Endurecimento ainda pendente (roadmap antifraude)
- **Sequência monotônica por terminal + conciliação server-side** para detectar
  vendas offline nunca sincronizadas (hoje a detecção depende de contagem física de
  estoque). Exigir fila drenada antes de fechar o caixa.
- **Bloqueio do terminal (PIN/biometria)** e revogação de sessão server-side (terminal
  roubado).
- **Pagamento `CORTESIA` deve gerar registro `Courtesy`** (beneficiário + motivo) para
  aparecer no relatório de cortesias e sair do faturamento.
- **Segredos**: exigir tamanho mínimo forte de `JWT_SECRET`/`JWT_REFRESH_SECRET` e
  senha admin forte em produção (hoje mín. 8 / placeholders passam na validação).
- **Bloqueio da senha admin em memória** (single-instance) → migrar para armazenamento
  compartilhado (Redis) ao escalar horizontalmente.
