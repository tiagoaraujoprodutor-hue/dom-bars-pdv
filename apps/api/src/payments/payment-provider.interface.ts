import { PaymentMethod, Prisma } from '@prisma/client';

export interface PaymentContext {
  eventId: string;
  amount: Prisma.Decimal;
  method: PaymentMethod;
  /** Referência externa opcional (ex.: NSU/QR no futuro PagBank). */
  reference?: string;
}

export interface PaymentResult {
  approved: boolean;
  providerRef: string;
}

/**
 * Camada de abstração de pagamentos (Strategy). Regras de negócio nunca acoplam
 * a um provedor específico (guardrail). Implementações futuras (PagBank/PlugPag)
 * apenas registram um provider para os métodos que tratam. Ver PLAN §6.8.
 */
export interface PaymentProvider {
  readonly name: string;
  readonly methods: PaymentMethod[];
  process(context: PaymentContext): Promise<PaymentResult>;
}

export const PAYMENT_PROVIDERS = Symbol('PAYMENT_PROVIDERS');
