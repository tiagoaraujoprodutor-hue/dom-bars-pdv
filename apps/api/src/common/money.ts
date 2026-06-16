import { Prisma } from '@prisma/client';

export type DecimalInput = Prisma.Decimal | number | string;

/** Cria um Decimal (decimal.js do Prisma) — aritmética monetária sem erro de float. */
export function dec(value: DecimalInput): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

/** Soma uma lista de valores monetários. */
export function sum(values: DecimalInput[]): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>((acc, v) => acc.plus(dec(v)), new Prisma.Decimal(0));
}
