import * as argon2 from 'argon2';
import { createHash } from 'node:crypto';

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/** Hash determinístico para indexar/buscar refresh tokens (JWT de alta entropia). */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
