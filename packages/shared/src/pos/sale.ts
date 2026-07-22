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
  /** Senha administrativa do evento — obrigatória quando o pagamento é CORTESIA. */
  adminPassword?: string;
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
  /** Nome da atendente que registrou a venda (opcional). */
  attendant?: string;
  /** Data/hora da venda já formatada (opcional). */
  dateTime?: string;
}

/** Metadados opcionais impressos no topo da ficha do bar. */
export interface TicketMeta {
  attendant?: string;
  dateTime?: string;
}

function money(value: string): string {
  return `R$ ${Number(value).toFixed(2)}`;
}

/** Monta o cupom de pagamento (PLAN §6.12) como um PrintJob neutro de SDK. */
export function buildReceipt(input: ReceiptInput): PrintJob {
  const lines: string[] = [];
  lines.push(input.eventName);
  lines.push('CUPOM NAO FISCAL');
  if (input.dateTime) lines.push(input.dateTime);
  if (input.attendant) lines.push(`Atendente: ${input.attendant}`);
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

/** Ficha de produção/bar: o que preparar/entregar (sem valores). */
export function buildProductionTicket(
  eventName: string,
  items: ReceiptLine[],
  meta: TicketMeta = {},
): PrintJob {
  const lines = [eventName, 'PRODUCAO / BAR'];
  if (meta.dateTime) lines.push(meta.dateTime);
  if (meta.attendant) lines.push(`Atendente: ${meta.attendant}`);
  lines.push('--------------------------------');
  for (const item of items) {
    lines.push(`${item.quantity}x ${item.name}`);
  }
  return { kind: 'production', title: 'Ficha de Produção', lines };
}
