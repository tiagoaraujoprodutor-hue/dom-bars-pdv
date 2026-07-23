import { Role } from '@prisma/client';
import { z } from 'zod';
import { moneySchema as money } from '../common/money';

export const createEventSchema = z.object({
  name: z.string().min(1),
  adminPassword: z.string().min(4, 'Senha admin do evento muito curta'),
  serviceFeeEnabled: z.boolean().default(false),
  serviceFeePercent: money.default(0),
  products: z
    .array(
      z.object({
        name: z.string().min(1),
        price: money,
        stock: z.number().int().min(0).default(0),
        minStock: z.number().int().min(0).default(0),
      }),
    )
    .optional(),
  users: z
    .array(
      z.object({
        name: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(6),
        role: z.nativeEnum(Role),
      }),
    )
    .optional(),
});
export type CreateEventDto = z.infer<typeof createEventSchema>;
