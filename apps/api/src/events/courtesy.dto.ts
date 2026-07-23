import { z } from 'zod';
import { moneySchema as money } from '../common/money';

export const createCourtesySchema = z.object({
  beneficiary: z.string().min(1, 'Beneficiário obrigatório'),
  reason: z.string().min(3, 'Motivo obrigatório'),
  amount: money,
  saleId: z.string().optional(),
  adminPassword: z.string().min(1),
});
export type CreateCourtesyDto = z.infer<typeof createCourtesySchema>;
