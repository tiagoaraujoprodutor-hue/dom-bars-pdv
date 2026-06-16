import { MockPrinter, type PrintJob, type Printer } from '@dom-bars/shared';
import { NativeModules } from 'react-native';

/**
 * Bridge de impressão do Smart 2. Em produção, um módulo nativo
 * (`Smart2Printer`) expõe o SDK da impressora térmica do terminal. Aqui fazemos
 * o binding e, se o módulo nativo não estiver presente (dev/Expo Go), caímos no
 * MockPrinter — sem acoplar a regra de negócio ao SDK (PLAN §6.12).
 */
interface Smart2PrinterModule {
  printLines(lines: string[]): Promise<void>;
}

const native = (NativeModules as { Smart2Printer?: Smart2PrinterModule }).Smart2Printer;

class NativePrinter implements Printer {
  constructor(private readonly module: Smart2PrinterModule) {}

  isAvailable(): Promise<boolean> {
    return Promise.resolve(true);
  }

  async print(job: PrintJob): Promise<void> {
    await this.module.printLines(job.lines);
  }
}

export const printer: Printer = native ? new NativePrinter(native) : new MockPrinter();
