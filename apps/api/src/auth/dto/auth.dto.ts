import { z } from 'zod';

export const loginSchema = z
  .object({
    email: z.string().email().optional(),
    cpf: z.string().min(1).optional(),
    password: z.string().min(1),
    machineId: z.string().optional(),
  })
  .refine((d) => Boolean(d.email) || Boolean(d.cpf), {
    message: 'Informe e-mail ou CPF',
  });
export type LoginDto = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshDto = z.infer<typeof refreshSchema>;

export const logoutSchema = z.object({
  refreshToken: z.string().min(1),
});
export type LogoutDto = z.infer<typeof logoutSchema>;
