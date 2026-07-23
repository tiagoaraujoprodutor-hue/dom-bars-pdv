import { Prisma } from '@prisma/client';
import { z } from 'zod';

export type DecimalInput = Prisma.Decimal | number | string;

/** Cria um Decimal (decimal.js do Prisma) — aritmética monetária sem erro de float. */
export function dec(value: DecimalInput): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

/** Soma uma lista de valores monetários. */
export function sum(values: DecimalInput[]): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>((acc, v) => acc.plus(dec(v)), new Prisma.Decimal(0));
}

/**
 * Schema Zod para valores monetários/quantidades na fronteira da API. Aceita
 * número ou string, mas SÓ passa se for um decimal finito e não-negativo — assim
 * um "abc", "NaN", "Infinity" ou negativo vira 400 (mensagem clara) em vez de
 * estourar `new Prisma.Decimal(...)` lá dentro e virar 500. É o único ponto de
 * verdade da validação monetária (todos os DTOs importam daqui).
 */
export const moneySchema = z
  .union([z.number(), z.string()])
  .refine(
    (v) => {
      try {
        const d = new Prisma.Decimal(v);
        return d.isFinite() && d.gte(0);
      } catch {
        return false;
      }
    },
    { message: 'Valor monetário inválido (use um número não-negativo)' },
  );
