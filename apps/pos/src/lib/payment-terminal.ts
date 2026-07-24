import type { PaymentMethod } from '@dom-bars/shared';
import * as PlugPag from '../../modules/plugpag';

export interface TerminalChargeResult {
  /** true = passou na maquininha (PlugPag); false = confirmação manual (como hoje). */
  integrated: boolean;
  approved: boolean;
  /** NSU/código da transação — anexar à venda quando integrado (rastreio/conciliação). */
  reference?: string;
}

/** Formas que passam na maquininha. Dinheiro/cortesia nunca passam. */
const TERMINAL_METHODS: PaymentMethod[] = ['CREDITO', 'DEBITO', 'PIX'];

/**
 * Orquestra o pagamento na maquininha PagBank (PlugPag).
 *
 * - HOJE (PlugPag inerte): devolve `{ integrated: false }` e o app segue no fluxo
 *   MANUAL de sempre — nada muda.
 * - DEPOIS (SDK + token plugados): roda crédito/débito/pix na maquininha e devolve o
 *   NSU para anexar à venda. Se a transação for RECUSADA, `approved` volta false e a
 *   venda não deve ser concluída.
 *
 * PONTO DE ENCAIXE (fazer quando ativar o PlugPag): em `SaleScreen.pay()`/split,
 * antes de montar o `payload`, chamar `chargeOnTerminal(method, amountCents)` para
 * cada parte em cartão/pix; se `!approved`, abortar; se aprovado, incluir `reference`
 * no pagamento. No servidor, guardar essa referência (NSU) no pagamento da venda.
 */
export async function chargeOnTerminal(
  method: PaymentMethod,
  amountCents: number,
): Promise<TerminalChargeResult> {
  // Sem maquininha integrada (estado atual) ou forma que não passa no pinpad → manual.
  if (!TERMINAL_METHODS.includes(method) || !PlugPag.isAvailable()) {
    return { integrated: false, approved: true };
  }
  const res = await PlugPag.charge({
    amountCents,
    method: method as PlugPag.TerminalMethod,
    printReceipt: true,
  });
  return { integrated: true, approved: res.approved, reference: res.reference };
}
