import { PrintJob, Printer } from './types';

/** Impressora de desenvolvimento: registra o cupom no console em vez de imprimir. */
export class MockPrinter implements Printer {
  public readonly printed: PrintJob[] = [];

  isAvailable(): Promise<boolean> {
    return Promise.resolve(true);
  }

  print(job: PrintJob): Promise<void> {
    this.printed.push(job);
    return Promise.resolve();
  }
}
