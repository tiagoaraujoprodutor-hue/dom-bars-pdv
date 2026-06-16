import { LossType } from '@prisma/client';
import { z } from 'zod';

const money = z.union([z.number(), z.string()]);

export const createLossSchema = z
  .object({
    type: z.nativeEnum(LossType),
    productId: z.string().optional(),
    ingredientId: z.string().optional(),
    quantity: money,
    reason: z.string().min(3, 'Motivo obrigatório'),
  })
  .refine((d) => Boolean(d.productId) !== Boolean(d.ingredientId), {
    message: 'Informe exatamente um alvo: produto OU insumo',
  });
export type CreateLossDto = z.infer<typeof createLossSchema>;
