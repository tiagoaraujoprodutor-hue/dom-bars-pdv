import { z } from 'zod';
import { moneySchema as money } from '../common/money';

export const updateEventConfigSchema = z
  .object({
    name: z.string().min(1).optional(),
    serviceFeeEnabled: z.boolean().optional(),
    serviceFeePercent: money.optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Nada para atualizar' });
export type UpdateEventConfigDto = z.infer<typeof updateEventConfigSchema>;
