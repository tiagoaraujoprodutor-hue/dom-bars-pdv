# PlugPag — pagamento integrado PagBank (esqueleto)

Provedor de pagamento **integrado** na maquininha PagBank: passar cartão
(crédito/débito) e gerar o pix **na própria maquininha**, com aprovação na hora e
NSU para conciliação.

## Estado atual: INERTE (não afeta o app)

Este módulo está **desligado de propósito**: não há `expo-module.config.json`
(só o `.example`), então o autolinking **não** o inclui no build. O app continua no
**fluxo manual** de hoje (o operador confirma o recebimento). Gerar um APK novo agora
**não muda nada** — é seguro.

## O que pedir ao PagBank (3 coisas)

1. **Habilitação do "Pagamento Integrado" (PlugPag)** para o seu CNPJ/maquininha.
2. **Credenciais de integração** — o **código de ativação / token de aplicação**.
3. **SDK + documentação do PlugPag** (a biblioteca Android e as coordenadas Maven).

> Os nomes/versões do PagBank mudam com o tempo — confirme os termos exatos com eles.

## Como ATIVAR (quando as 3 coisas chegarem)

1. **Dependência do SDK** — em `android/build.gradle` deste módulo, descomente a
   dependência do wrapper PlugPag e adicione o repositório Maven do PagSeguro
   (URL/coordenadas confirmadas com o PagBank).
2. **Ligar o módulo** — renomeie:
   `expo-module.config.json.example` → `expo-module.config.json`.
3. **Token de ativação** — guarde o código de ativação de forma **segura** (não
   commitar; ex.: variável de build/secret do EAS) e use-o em
   `initializeAndActivatePinpad(...)`.
4. **Preencher `charge()`** — no `PlugPagModule.kt`, complete os TODOs com as chamadas
   reais do SDK (`doPayment`) e troque `configured` para refletir a ativação.
5. **Encaixar no fluxo de venda** — em `apps/pos/src/screens/SaleScreen.tsx`
   (`pay()` e o pagamento dividido), antes de montar o `payload`, chame
   `chargeOnTerminal(method, amountCents)` de `src/lib/payment-terminal.ts` para cada
   parte em cartão/pix; se `!approved`, aborte; se aprovado, inclua a `reference` (NSU)
   no pagamento.
6. **Guardar o NSU no servidor** — no `apps/api`, aceitar uma `reference` opcional por
   pagamento e persistir (coluna `providerRef`/`nsu` no `Payment` — migração nova).
   O `PaymentProvider` (Strategy) já existe; o provedor integrado só registra a
   referência que a maquininha capturou, sem reprocessar.
7. **Rebuild** — `cd apps/pos && eas build -p android --profile preview` e valide na
   maquininha (transação aprovada, recusada, e cancelamento).

## Arquivos

- `index.ts` — API TS do módulo (`isAvailable()`, `charge()`, `abort()`). Seguro
  quando inerte (retorna indisponível).
- `android/.../PlugPagModule.kt` — módulo nativo (stub compilável + TODOs do SDK).
- `android/build.gradle` — dependência do SDK (comentada).
- `expo-module.config.json.example` — renomear para ativar o autolinking.
- `../../src/lib/payment-terminal.ts` — orquestrador usado pela tela de venda.
