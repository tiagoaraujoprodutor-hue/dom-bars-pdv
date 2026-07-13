import { Role } from '@prisma/client';
import { z } from 'zod';
import { isValidCpf } from '../common/cpf';

const cpf = z.string().refine(isValidCpf, { message: 'CPF inválido' });

export const createAttendantSchema = z.object({
  name: z.string().min(1),
  cpf,
  password: z.string().min(4, 'Senha muito curta'),
  role: z.nativeEnum(Role).default(Role.OPERADOR),
  // Validade da senha para este evento (ISO). Sem valor = não expira.
  expiresAt: z.string().datetime().optional(),
});
export type CreateAttendantDto = z.infer<typeof createAttendantSchema>;

export const updateAttendantSchema = z
  .object({
    password: z.string().min(4).optional(),
    role: z.nativeEnum(Role).optional(),
    active: z.boolean().optional(),
    // envie null para remover a validade; string ISO para definir.
    expiresAt: z.string().datetime().nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Nada para atualizar' });
export type UpdateAttendantDto = z.infer<typeof updateAttendantSchema>;
