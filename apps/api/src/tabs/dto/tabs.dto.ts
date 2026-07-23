import { PaymentMethod } from '@prisma/client';
import { z } from 'zod';
import { moneySchema as money } from '../../common/money';

export const createTabSchema = z.object({
  /** Valor do QR Code. Se omitido, é gerado automaticamente. */
  code: z.string().min(1).optional(),
});
export type CreateTabDto = z.infer<typeof createTabSchema>;

export const addTabItemsSchema = z.object({
  items: z
    .array(z.object({ productId: z.string().min(1), quantity: z.number().int().positive() }))
    .min(1),
});
export type AddTabItemsDto = z.infer<typeof addTabItemsSchema>;

export const closeTabSchema = z.object({
  clientId: z.string().min(8),
  machineId: z.string().optional(),
  payments: z
    .array(z.object({ method: z.nativeEnum(PaymentMethod), amount: money }))
    .min(1),
});
export type CloseTabDto = z.infer<typeof closeTabSchema>;
