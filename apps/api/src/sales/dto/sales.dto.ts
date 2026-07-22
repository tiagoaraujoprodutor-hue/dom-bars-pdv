import { PaymentMethod } from '@prisma/client';
import { z } from 'zod';

const money = z.union([z.number(), z.string()]);

export const saleItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
});

export const paymentSchema = z.object({
  method: z.nativeEnum(PaymentMethod),
  amount: money,
});

export const createSaleSchema = z.object({
  /** UUID gerado no terminal — chave de idempotência (PLAN ADR-04). */
  clientId: z.string().min(8),
  machineId: z.string().optional(),
  items: z.array(saleItemSchema).min(1),
  payments: z.array(paymentSchema).min(1),
  applyServiceFee: z.boolean().default(false),
  /** Senha administrativa do evento — obrigatória quando há pagamento CORTESIA. */
  adminPassword: z.string().optional(),
});
export type CreateSaleDto = z.infer<typeof createSaleSchema>;

export const cancelSaleSchema = z.object({
  adminPassword: z.string().min(1),
  reason: z.string().min(3, 'Motivo obrigatório'),
});
export type CancelSaleDto = z.infer<typeof cancelSaleSchema>;
