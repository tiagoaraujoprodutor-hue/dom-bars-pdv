import { requireOptionalNativeModule } from 'expo-modules-core';

// requireOptionalNativeModule retorna null se o módulo nativo não estiver no build
// (ex.: dev sem o SDK). Assim o app nunca quebra por falta da impressora.
const Native = requireOptionalNativeModule<{ printLines(lines: string[]): Promise<void> }>(
  'Smart2Printer',
);

export const isAvailable: boolean = Native != null;

export function printLines(lines: string[]): Promise<void> {
  if (!Native) return Promise.resolve();
  return Native.printLines(lines);
}
