import { requireOptionalNativeModule } from 'expo-modules-core';

/** Formas que passam NA maquininha. Dinheiro e cortesia nunca passam. */
export type TerminalMethod = 'CREDITO' | 'DEBITO' | 'PIX';

export interface PlugPagChargeInput {
  /** Valor em CENTAVOS (ex.: R$ 12,50 = 1250). */
  amountCents: number;
  method: TerminalMethod;
  /** Se a própria maquininha deve imprimir a via do cartão. */
  printReceipt?: boolean;
}

export interface PlugPagResult {
  approved: boolean;
  /** NSU / código de autorização (cartão) ou EndToEndId (pix). Guardar na venda. */
  reference: string;
  message?: string;
  cardBrand?: string;
  authorizationCode?: string;
}

interface NativePlugPag {
  isConfigured(): boolean;
  charge(input: PlugPagChargeInput): Promise<PlugPagResult>;
  abort(): Promise<void>;
}

// `null` enquanto o módulo nativo NÃO estiver no build (estado atual). Para ativar,
// renomeie `expo-module.config.json.example` -> `expo-module.config.json` e siga o README.
const Native = requireOptionalNativeModule<NativePlugPag>('PlugPag');

/** true SÓ quando o módulo está no build E ativado (SDK + token do PagBank). */
export function isAvailable(): boolean {
  try {
    return Native != null && Native.isConfigured();
  } catch {
    return false;
  }
}

/** Dispara a transação na maquininha. Lança se PlugPag não estiver no build/ativo. */
export function charge(input: PlugPagChargeInput): Promise<PlugPagResult> {
  if (!Native) return Promise.reject(new Error('PlugPag não incluído no build.'));
  return Native.charge(input);
}

/** Cancela uma transação em andamento (ex.: operador desistiu). Seguro se inerte. */
export function abort(): Promise<void> {
  return Native?.abort() ?? Promise.resolve();
}
