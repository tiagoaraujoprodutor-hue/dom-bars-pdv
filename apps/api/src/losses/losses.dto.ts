import { LossType } from '@prisma/client';
import { z } from 'zod';
import { moneySchema as money } from '../common/money';

export const createLossSchema = z
  .object({
    type: z.nativeEnum(LossType),
    productId: z.string().optional(),
    ingredientId: z.string().optional(),
    quantity: money,
    reason: z.string().min(3, 'Motivo obrigatório'),
    /** Baixa de estoque como perda move mercadoria: exige a senha admin do evento. */
    adminPassword: z.string().min(1, 'Senha administrativa obrigatória'),
  })
  .refine((d) => Boolean(d.productId) !== Boolean(d.ingredientId), {
    message: 'Informe exatamente um alvo: produto OU insumo',
  });
export type CreateLossDto = z.infer<typeof createLossSchema>;
