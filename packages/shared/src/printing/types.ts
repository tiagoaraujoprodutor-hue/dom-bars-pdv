/**
 * Abstração de impressão (PLAN §6.12). O app POS injeta uma implementação nativa
 * (SDK da impressora do Smart 2) em produção; em dev/web usa-se o MockPrinter.
 * A regra de negócio nunca acopla a um SDK específico.
 */

export type PrintJobKind = 'receipt' | 'production';

export interface PrintJob {
  kind: PrintJobKind;
  title: string;
  lines: string[];
}

export interface Printer {
  isAvailable(): Promise<boolean>;
  print(job: PrintJob): Promise<void>;
}
