import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(8, 'JWT_SECRET deve ter ao menos 8 caracteres'),
  JWT_REFRESH_SECRET: z.string().min(8, 'JWT_REFRESH_SECRET deve ter ao menos 8 caracteres'),
  // Token de acesso dura um turno de evento (evita logout no meio da operação).
  // O refresh rotativo renova de forma transparente; terminais são de confiança.
  JWT_ACCESS_TTL: z.string().default('12h'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  THROTTLE_TTL: z.coerce.number().int().positive().default(60_000),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(2_000),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  return envSchema.parse(config);
}
