package com.dombars.smart2printer

import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Bridge da impressora térmica do Smart 2. O lado JS (printer.ts) chama
 * `printLines(lines)`. Aqui você integra o SDK do fabricante.
 *
 * Sem o SDK, apenas registra no log (não quebra). Ao adicionar o SDK, troque o
 * corpo de `printLines` pela chamada real.
 */
class Smart2PrinterModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("Smart2Printer")

    AsyncFunction("printLines") { lines: List<String> ->
      // TODO: integrar o SDK da impressora do terminal. Exemplos:
      //
      //   // Sunmi (InnerPrinter):
      //   val printer = SunmiPrinterService.getInstance()
      //   lines.forEach { printer.printText(it + "\n", null) }
      //   printer.lineWrap(3, null)
      //
      //   // Genérico (ESC/POS por porta serial/USB):
      //   val out = connection.openOutputStream()
      //   lines.forEach { out.write((it + "\n").toByteArray(Charsets.UTF_8)) }
      //   out.write(byteArrayOf(0x1D, 0x56, 0x00)) // corte de papel
      //   out.flush()
      Log.i("Smart2Printer", lines.joinToString(separator = "\n"))
    }
  }
}
