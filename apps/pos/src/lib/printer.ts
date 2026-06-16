import { MockPrinter, type PrintJob, type Printer } from '@dom-bars/shared';
import * as Smart2 from '../../modules/smart2-printer';

/**
 * Seleção da impressora: se o módulo nativo `Smart2Printer` estiver presente no
 * build (com o SDK do terminal), usa a térmica; senão, cai no MockPrinter. A
 * regra de negócio chama `printer.print(job)` sem conhecer o SDK (PLAN §6.12 / ADR-15).
 */
class NativePrinter implements Printer {
  isAvailable(): Promise<boolean> {
    return Promise.resolve(true);
  }

  print(job: PrintJob): Promise<void> {
    return Smart2.printLines(job.lines);
  }
}

export const printer: Printer = Smart2.isAvailable ? new NativePrinter() : new MockPrinter();
