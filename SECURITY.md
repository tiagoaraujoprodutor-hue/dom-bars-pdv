# Segurança — postura e revisão

Resumo dos controles implementados e pontos de atenção para produção.

## Controles implementados
- **Autenticação**: JWT (access curto + refresh com rotação e `jti`); senhas com **argon2**.
- **Autorização**: RBAC por papel + **escopo por evento** aplicado em guard no servidor
  (`JwtAuthGuard → EventScopeGuard → RolesGuard`). Nunca confia no frontend.
- **Senha administrativa por evento** para ações críticas (sangria, suprimento, cortesia,
  reembolso, ajuste de estoque, encerramento) — sempre com justificativa.
- **Auditoria append-only**: trigger no Postgres bloqueia UPDATE/DELETE em `AuditLog`
  (vale inclusive para o owner).
- **Validação de entrada** com Zod em toda fronteira de API.
- **Rate limiting** (Throttler) configurável por env, dimensionado p/ evento.
- **Cabeçalhos de segurança** via `helmet`.
- **Filtro global de exceções**: não vaza stack trace; loga 5xx.
- **Idempotência de venda** (`@@unique(eventId, clientId)`) evita duplicidade sob carga
  e no sync offline (validado por teste de carga: 300 vendas, 0 duplicatas).
- **Segredos fora do git** (`.env*` no `.gitignore`; `.env.example` versionado).

## Recomendações para produção (hardening contínuo)
- TLS obrigatório (Coolify/Caddy) — terminais devem falar HTTPS com a API.
- Trocar todos os segredos default (`JWT_*`, senha do Postgres) por valores aleatórios.
- Cookies httpOnly + SameSite no painel web (hoje usa `localStorage`; ver PLAN ADR-12).
- Backups criptografados e armazenados **fora** do VPS; restore testado.
- Atualizar dependências periodicamente (`pnpm audit`).
- Limitar exposição do Postgres/Redis à rede interna do compose (não publicar portas em prod).
- Monitorar logs/healthchecks; alertar em 5xx e em falhas de sync.

## Escopo de teste de segurança
RBAC, escopo de evento, senha admin, auditoria append-only e idempotência têm **cobertura
de teste automatizada**. Pen-test e revisão de infra (firewall, SSH, fail2ban no VPS) ficam
a cargo da operação de deploy.
