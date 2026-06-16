import { PrintJob } from '../printing/types';

/** Contratos da venda compartilhados entre POS e API (espelham os schemas Zod da API). */
export interface SaleItemInput {
  productId: string;
  quantity: number;
}

export type PaymentMethod = 'PIX' | 'CREDITO' | 'DEBITO' | 'DINHEIRO' | 'CORTESIA';

export interface SalePaymentInput {
  method: PaymentMethod;
  amount: string;
}

export interface SalePayload {
  clientId: string;
  machineId?: string;
  items: SaleItemInput[];
  payments: SalePaymentInput[];
  applyServiceFee?: boolean;
}

export interface ReceiptLine {
  name: string;
  quantity: number;
  unitPrice: string;
}

export interface ReceiptInput {
  eventName: string;
  saleId: string;
  items: ReceiptLine[];
  subtotal: string;
  serviceFee: string;
  total: string;
  payments: SalePaymentInput[];
}

function money(value: string): string {
  return `R$ ${Number(value).toFixed(2)}`;
}

/** Monta o cupom de pagamento (PLAN §6.12) como um PrintJob neutro de SDK. */
export function buildReceipt(input: ReceiptInput): PrintJob {
  const lines: string[] = [];
  lines.push(input.eventName);
  lines.push('CUPOM NAO FISCAL');
  lines.push('--------------------------------');
  for (const item of input.items) {
    lines.push(`${item.quantity}x ${item.name}`);
    lines.push(`   ${money(item.unitPrice)}`);
  }
  lines.push('--------------------------------');
  lines.push(`Subtotal: ${money(input.subtotal)}`);
  if (Number(input.serviceFee) > 0) {
    lines.push(`Taxa de servico: ${money(input.serviceFee)}`);
  }
  lines.push(`TOTAL: ${money(input.total)}`);
  lines.push('--------------------------------');
  for (const payment of input.payments) {
    lines.push(`${payment.method}: ${money(payment.amount)}`);
  }
  lines.push(`Venda: ${input.saleId}`);

  return { kind: 'receipt', title: 'Comprovante', lines };
}

/** Ficha de produção/bar: o que preparar (sem valores). */
export function buildProductionTicket(eventName: string, items: ReceiptLine[]): PrintJob {
  const lines = [eventName, 'PRODUCAO / BAR', '--------------------------------'];
  for (const item of items) {
    lines.push(`${item.quantity}x ${item.name}`);
  }
  return { kind: 'production', title: 'Ficha de Produção', lines };
}
