import { z } from 'zod';

export const adminActionSchema = z.object({
  adminPassword: z.string().min(1),
  reason: z.string().min(3, 'Justificativa obrigatória'),
});
export type AdminActionDto = z.infer<typeof adminActionSchema>;
