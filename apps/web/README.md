# @dom-bars/web

Painel administrativo (Next.js App Router) com dashboard em tempo real.

## Rodar

```bash
cp .env.example .env.local   # ajuste NEXT_PUBLIC_API_URL se necessário
pnpm --filter @dom-bars/web dev   # http://localhost:3001
```

Login demo (após `prisma:seed` na API): `admin@demo.com` / `senha123`.

## Páginas

- `/login` — autenticação (JWT).
- `/events` — lista de eventos + atalho para o **wizard** (`/events/new`).
- `/events/[id]/dashboard` — **FATURAMENTO BRUTO** em destaque, atualizando via
  WebSocket (`dashboard:update`); indicador de online/offline.
- `/events/[id]/products` — gestão de produtos/estoque.
- `/events/[id]/users` — cadastro de usuários do evento (perfis RBAC).

A comunicação em tempo real usa socket.io no namespace `/events`, autenticada por
JWT + membership do evento.
