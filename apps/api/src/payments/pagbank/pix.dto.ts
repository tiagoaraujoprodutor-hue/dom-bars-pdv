import { z } from 'zod';
import { moneySchema as money } from '../../common/money';

export const createPixSchema = z.object({
  /** Valor em reais (validado e não-negativo). */
  amount: money,
  /** UUID gerado no terminal — mesma chave de idempotência da venda (referenceId). */
  clientId: z.string().min(8),
});
export type CreatePixDto = z.infer<typeof createPixSchema>;
