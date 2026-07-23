/**
 * Abstração de impressão (PLAN §6.12). O app POS injeta uma implementação nativa
 * (SDK da impressora do Smart 2) em produção; em dev/web usa-se o MockPrinter.
 * A regra de negócio nunca acopla a um SDK específico.
 */

export type PrintJobKind = 'receipt' | 'production';

export interface PrintJob {
  kind: PrintJobKind;
  title: string;
  /**
   * Cabeçalho em DESTAQUE (nome do evento). Impresso grande, centralizado e em
   * negrito no topo da ficha — deixa claro de qual evento é o comprovante, evita
   * confusão entre eventos e dificulta reaproveitar uma ficha de outra festa (fraude).
   */
  header?: string;
  lines: string[];
}

export interface Printer {
  isAvailable(): Promise<boolean>;
  print(job: PrintJob): Promise<void>;
}
