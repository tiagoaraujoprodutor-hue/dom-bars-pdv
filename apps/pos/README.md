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

## Build do APK na nuvem (sem Android SDK local) — EAS

Se você não tem Android Studio/SDK na máquina, gere o APK pela nuvem do Expo:

```bash
npm i -g eas-cli
cd apps/pos
eas login                 # sua conta Expo (grátis)
eas init                  # cria o projeto EAS e grava o projectId no app.json
eas build -p android --profile preview   # gera um APK instalável
```

Ao terminar, o EAS dá um link para baixar o **APK**; instale nos Smart 2 (ou distribua
internamente). Perfis em `eas.json`: `preview`/`development` = APK, `production` = AAB.

> Ajuste `EXPO_PUBLIC_API_URL` (em `.env` ou nas env vars do build EAS) para a URL pública
> da API antes de gerar o APK que vai para os terminais.

## Habilitar a impressora do Smart 2 (módulo nativo)

O bridge JS já está pronto (`src/lib/printer.ts`): ele usa `NativeModules.Smart2Printer`
e cai no MockPrinter se o módulo não existir. Para imprimir de verdade:

1. Crie um módulo nativo Android (Kotlin) chamado `Smart2Printer` com o método
   `printLines(lines: ReadableArray)` que chama o **SDK da impressora do fabricante**
   (geralmente um `.aar`/`.jar` que acompanha o Smart 2).
2. Adicione o SDK em `android/app/libs/` e registre o package no `MainApplication`.
   Em projeto Expo, faça isso via `expo prebuild` + um **config plugin** ou um
   **Expo Module local** (`npx create-expo-module --local`).
3. Reconstrua com `eas build` (ou `expo run:android`). Nenhuma mudança no resto do app:
   o `printer.print(job)` passa a sair na térmica automaticamente.

## Fluxo de venda (2–3 toques)

Grade de produtos → toque adiciona ao carrinho → **Cobrar** → forma de pagamento →
venda registrada (com indicador online/offline e fila de sync).
