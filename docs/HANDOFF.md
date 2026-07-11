# HANDOFF — estado do projeto (pausa)

> Documento de retomada. Quando voltar, comece por aqui.

**Branch de trabalho:** `claude/pensive-thompson-akcxd9` (tudo commitado e no remoto).
**Data da pausa:** 2026-06-16.

## Onde o projeto está
Plataforma PDV **completa nas 7 fases** do roadmap (ver `PLAN.md`):

| Fase | Status |
|---|---|
| 0 Fundação (monorepo, Docker, CI, /health) | ✅ |
| 1 Auth + Multi-tenant + RBAC + Auditoria append-only | ✅ |
| 2 Núcleo operacional (caixa, produtos, ficha técnica, comandas, vendas, pagamentos, cortesia/estorno, Swagger) | ✅ |
| 3 Painel web tempo real (Next.js + WebSocket, wizard de evento) | ✅ |
| 4 Relatórios PDF + fechamento de evento | ✅ |
| 5 + 6 App POS (Expo) offline-first + motor de sync idempotente | ✅ (lógica testada) |
| 7 Hardening + teste de carga + backups + deploy | ✅ (deploy documentado) |

**Qualidade:** 51 testes verdes (44 API e2e + 7 offline/recibo). Lint e build limpos.
Teste de carga real: 15 terminais → 300 vendas, 0 duplicatas, ~77 v/s.

## Como retomar o desenvolvimento (dev local)
```bash
pnpm install
# Banco: docker compose up  (ou um Postgres local em 127.0.0.1:5432, user/pass pdv)
pnpm --filter @dom-bars/api prisma:deploy && pnpm --filter @dom-bars/api prisma:seed
pnpm --filter @dom-bars/api dev        # API :3000  (Swagger em /docs)
pnpm --filter @dom-bars/web dev        # Painel :3001
# Testes:
DATABASE_URL=postgresql://pdv:pdv@127.0.0.1:5432/pdv_test pnpm test
pnpm lint && pnpm build
```
Login demo: `admin@demo.com` / `senha123` · senha admin do evento demo: `admin123`.

> Nota de ambiente: o Docker Hub/CDN estava bloqueado na sessão de build, então os testes
> rodaram contra um Postgres local (não via `docker compose`). Em máquina com Docker normal,
> `docker compose up` deve funcionar.

## Decisões já tomadas (para não re-decidir)
- Offline engine: **PowerSync** como alvo p/ estado compartilhado; **outbox + idempotência**
  já implementado para o write-path de vendas (ADR-14).
- Hospedagem: **Coolify em 1 VPS** (backend) + **Netlify** (painel).
- App/impressora: gerar APK via **EAS**; módulo nativo `Smart2Printer` já scaffoldado.
- Todas as ADRs (01–16) estão em `PLAN.md`.

## Pendências para quando voltar (o que falta para ir ao ar)
1. **Backend em produção (Coolify):** criar VPS + instalar Coolify e seguir
   `infra/DEPLOY_COOLIFY.md`. Resultado: URL pública da API.
2. **Painel no Netlify:** após a API ter URL, seguir `infra/DEPLOY_NETLIFY.md`
   (ou pedir para o Claude publicar via integração). Config pronta em `netlify.toml`.
3. **APK do terminal:** `cd apps/pos && eas login && eas init && eas build -p android --profile preview`.
4. **Impressora Smart 2 (BLOQUEADO por info):** informar a **marca/modelo** do terminal
   (Sunmi/PAX/Gertec/…) e ter o **SDK/.aar** do fabricante. Aí preencher o
   `apps/pos/modules/smart2-printer/android/.../Smart2PrinterModule.kt` (hoje só faz log)
   e a dependência do SDK no `build.gradle` do módulo.

## Pergunta aberta (última interação)
O Claude perguntou **qual a marca/modelo do "Smart 2"** para escrever o código de impressão
exato. Responder isso destrava a impressão real.

## Documentos-chave
- Arquitetura/decisões: `PLAN.md` · Convenções: `CLAUDE.md`
- Deploy: `docs/MANUAL_INSTALACAO.md`, `infra/DEPLOY_COOLIFY.md`, `infra/DEPLOY_NETLIFY.md`
- Operação: `docs/MANUAL_OPERACIONAL.md`, `infra/CHECKLIST_DIA_DE_EVENTO.md`
- Segurança: `SECURITY.md` · Carga: `infra/load-test/` · Backup: `infra/backup/`
