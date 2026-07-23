package com.dombars.smart2printer

import android.content.Context
import android.util.Log
import com.sunmi.peripheral.printer.InnerPrinterCallback
import com.sunmi.peripheral.printer.InnerPrinterException
import com.sunmi.peripheral.printer.InnerPrinterManager
import com.sunmi.peripheral.printer.SunmiPrinterService
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Impressora térmica do Smart POS P2 (Sunmi P2) via biblioteca oficial da Sunmi.
 * Faz o bind ao serviço interno de impressão e imprime as linhas do cupom.
 * O lado JS (printer.ts) chama `printLines(lines)`.
 */
class Smart2PrinterModule : Module() {
  private var printerService: SunmiPrinterService? = null

  private val innerCallback = object : InnerPrinterCallback() {
    override fun onConnected(service: SunmiPrinterService) {
      printerService = service
    }

    override fun onDisconnected() {
      printerService = null
    }
  }

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("Smart2Printer")

    OnCreate {
      try {
        InnerPrinterManager.getInstance().bindService(context, innerCallback)
      } catch (e: InnerPrinterException) {
        Log.e("Smart2Printer", "Falha ao conectar à impressora Sunmi", e)
      }
    }

    OnDestroy {
      try {
        InnerPrinterManager.getInstance().unBindService(context, innerCallback)
      } catch (e: InnerPrinterException) {
        Log.w("Smart2Printer", "Falha ao desconectar da impressora", e)
      }
    }

    AsyncFunction("printDoc") { header: String, lines: List<String> ->
      val service = printerService
        ?: throw IllegalStateException("Impressora não conectada (serviço Sunmi indisponível)")

      // callback nulo: impressão fire-and-forget, sem bloquear.
      service.printerInit(null)

      // Cabeçalho (nome do evento) em DESTAQUE: centralizado, grande e em negrito.
      // Deixa claro de qual evento é a ficha e dificulta reaproveitar comprovante
      // de outra festa. Negrito via ESC/POS (universal); se falhar, segue sem negrito.
      if (header.isNotBlank()) {
        service.setAlignment(1, null) // 1 = centralizado
        try {
          service.sendRAWData(byteArrayOf(0x1B, 0x45, 0x01), null) // ESC E 1 = negrito ON
        } catch (e: Throwable) {
          Log.w("Smart2Printer", "Negrito indisponível, imprimindo sem", e)
        }
        service.printTextWithFont(header + "\n", null, 48f, null) // ~2x o tamanho padrão
        try {
          service.sendRAWData(byteArrayOf(0x1B, 0x45, 0x00), null) // ESC E 0 = negrito OFF
        } catch (e: Throwable) {
          Log.w("Smart2Printer", "Negrito indisponível ao desligar", e)
        }
        service.setAlignment(0, null) // volta ao alinhamento padrão (esquerda)
        service.lineWrap(1, null)
      }

      // Corpo: texto normal.
      for (line in lines) {
        service.printText(line + "\n", null)
      }
      service.lineWrap(3, null)
    }
  }
}
