# @dom-bars/pos

App Android (React Native + Expo dev client) para os terminais **Smart 2**.
Operação **offline-first**: vende sem internet e sincroniza ao reconectar.

> Precisa de **módulos nativos** (impressora/pagamento do Smart 2) → não roda no
> Expo Go. Use **dev client / prebuild**.

## Rodar (máquina com Android SDK)

```bash
cp .env.example .env                 # ajuste EXPO_PUBLIC_API_URL
pnpm --filter @dom-bars/shared build # o POS consome o pacote shared compilado
npx expo install                     # alinha versões nativas ao SDK (recomendado)
pnpm --filter @dom-bars/pos prebuild # gera projeto android nativo
pnpm --filter @dom-bars/pos android  # build + instala no device/emulador
```

Login demo: `operador@demo.com` / `senha123`.

## Arquitetura offline (regra de ouro)

- **Outbox durável** em SQLite (`src/lib/sqlite-outbox.ts`) — a venda é persistida
  **antes** de qualquer rede; só sai de `pending` quando o servidor confirma → **não perde**.
- **Idempotência** por `clientId` (UUID do terminal): o `INSERT OR IGNORE` deduplica
  localmente e a API faz upsert por `clientId` → **não duplica** ao reenviar.
- O **motor de sync** (`@dom-bars/shared` → `SyncEngine`) drena a fila quando há rede.
  Sua lógica é coberta por testes em `packages/shared` (zero perda / zero duplicação).

## Impressão

`src/lib/printer.ts` faz o binding com o módulo nativo `Smart2Printer` (SDK da
impressora). Sem o módulo (dev), cai no `MockPrinter` de `@dom-bars/shared`. A
regra de negócio nunca acopla ao SDK.

## Fluxo de venda (2–3 toques)

Grade de produtos → toque adiciona ao carrinho → **Cobrar** → forma de pagamento →
venda registrada (com indicador online/offline e fila de sync).
