import { requireOptionalNativeModule } from 'expo-modules-core';

// requireOptionalNativeModule retorna null se o módulo nativo não estiver no build
// (ex.: dev sem o SDK). Assim o app nunca quebra por falta da impressora.
const Native = requireOptionalNativeModule<{
  printDoc(header: string, lines: string[]): Promise<void>;
}>('Smart2Printer');

export const isAvailable: boolean = Native != null;

/**
 * Imprime uma ficha: `header` (nome do evento) sai em DESTAQUE no topo — grande,
 * centralizado e em negrito — e as `lines` no corpo em texto normal.
 */
export function printDoc(header: string, lines: string[]): Promise<void> {
  if (!Native) return Promise.resolve();
  return Native.printDoc(header, lines);
}
