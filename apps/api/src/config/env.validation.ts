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

  // --- PagBank Orders API (PIX online) — INERTE enquanto PAGBANK_ENABLED=false ---
  // Booleano de env tratado à mão de propósito: z.coerce.boolean() transforma a
  // STRING "false" em true (Boolean("false") === true). Aqui só 'true'/'1' liga.
  PAGBANK_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  PAGBANK_BASE_URL: z.string().url().default('https://sandbox.api.pagseguro.com'),
  PAGBANK_TOKEN: z.string().optional(),
  // Segredo NOSSO: entra na querystring do webhook (?t=...) p/ barrar POST forjado.
  PAGBANK_WEBHOOK_TOKEN: z.string().optional(),
  // URL pública deste backend, usada p/ montar notification_urls do PagBank.
  PAGBANK_NOTIFICATION_URL: z.string().url().optional(),
  // Validade do QR PIX em segundos (30 min por padrão).
  PAGBANK_PIX_EXPIRATION_SECONDS: z.coerce.number().int().positive().default(1800),
});

// Guardrail de boot: se ligar o PagBank, os segredos/URL são obrigatórios — falha
// rápida no start em vez de quebrar no meio de uma venda.
const refinedSchema = envSchema.refine(
  (e) =>
    !e.PAGBANK_ENABLED ||
    (!!e.PAGBANK_TOKEN && !!e.PAGBANK_NOTIFICATION_URL && !!e.PAGBANK_WEBHOOK_TOKEN),
  {
    message:
      'PAGBANK_ENABLED=true exige PAGBANK_TOKEN, PAGBANK_NOTIFICATION_URL e PAGBANK_WEBHOOK_TOKEN',
    path: ['PAGBANK_ENABLED'],
  },
);

export type Env = z.infer<typeof refinedSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  return refinedSchema.parse(config);
}
