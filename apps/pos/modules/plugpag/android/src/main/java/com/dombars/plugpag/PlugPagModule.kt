package com.dombars.plugpag

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Esqueleto do provedor de pagamento integrado PagBank (PlugPag) para a maquininha.
 *
 * ESTADO ATUAL: INERTE. `isConfigured()` retorna false e `charge()` recusa, então o
 * app cai no fluxo MANUAL (o operador confirma o recebimento). Nada muda até ativar.
 *
 * PARA ATIVAR (quando o PagBank liberar a integração):
 *  1. build.gradle: descomente a dependência do wrapper PlugPag + o repositório Maven
 *     do PagSeguro (ver o build.gradle deste módulo).
 *  2. Autolinking: renomeie `expo-module.config.json.example` -> `expo-module.config.json`.
 *  3. Guarde o CÓDIGO DE ATIVAÇÃO (token) do PagBank de forma segura (NÃO commitar).
 *  4. Troque `configured` para refletir a ativação e preencha os TODOs de `charge()`.
 *  5. Gere um APK novo (eas build) e valide na maquininha.
 */
class PlugPagModule : Module() {
  // Vira true quando o SDK + token estiverem plugados e a ativação der certo.
  private val configured = false

  override fun definition() = ModuleDefinition {
    Name("PlugPag")

    Function("isConfigured") { configured }

    AsyncFunction("charge") { _: Map<String, Any?> ->
      // TODO(PlugPag) — fluxo típico do wrapper (CONFIRME nomes/versão na doc do PagBank):
      //   val plugpag = PlugPag(
      //     appContext.reactContext!!,
      //     PlugPagAppIdentification("DomBars PDV", "1.0"),
      //   )
      //   // ativação uma única vez por aparelho:
      //   plugpag.initializeAndActivatePinpad(PlugPagActivationData(ACTIVATION_CODE))
      //   val type = when (input["method"]) {
      //     "CREDITO" -> PlugPag.TYPE_CREDITO
      //     "DEBITO"  -> PlugPag.TYPE_DEBITO
      //     "PIX"     -> PlugPag.TYPE_PIX
      //     else      -> throw IllegalArgumentException("forma inválida")
      //   }
      //   val amount = (input["amountCents"] as Number).toInt()
      //   val data = PlugPagPaymentData(type, amount, PlugPag.INSTALLMENT_TYPE_A_VISTA, 1, "venda", true)
      //   val r = plugpag.doPayment(data)
      //   return@AsyncFunction mapOf(
      //     "approved"          to (r.result == PlugPag.RET_OK),
      //     "reference"         to (r.transactionId ?: r.nsu ?: ""),
      //     "message"           to r.message,
      //     "cardBrand"         to r.cardBrand,
      //     "authorizationCode" to r.transactionCode,
      //   )
      throw IllegalStateException("PlugPag ainda não configurado (SDK/token pendentes).")
    }

    AsyncFunction("abort") {
      // TODO(PlugPag): plugpag.abort() para cancelar transação em andamento.
    }
  }
}
