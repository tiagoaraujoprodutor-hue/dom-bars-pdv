import { z } from 'zod';
import { moneySchema as money } from '../../common/money';

export const openCashSchema = z.object({
  openingAmount: money.default(0),
});
export type OpenCashDto = z.infer<typeof openCashSchema>;

export const closeCashSchema = z.object({
  closingAmount: money,
  adminPassword: z.string().min(1),
});
export type CloseCashDto = z.infer<typeof closeCashSchema>;

export const closeAllSchema = z.object({
  adminPassword: z.string().min(1),
});
export type CloseAllDto = z.infer<typeof closeAllSchema>;

export const cashMovementSchema = z.object({
  amount: money,
  reason: z.string().min(3, 'Motivo obrigatório'),
  adminPassword: z.string().min(1),
});
export type CashMovementDto = z.infer<typeof cashMovementSchema>;
