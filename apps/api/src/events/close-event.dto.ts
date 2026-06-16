import { z } from 'zod';

export const closeEventSchema = z.object({
  adminPassword: z.string().min(1),
});
export type CloseEventDto = z.infer<typeof closeEventSchema>;
