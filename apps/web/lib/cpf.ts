/** Só dígitos (máx 11). */
export function cpfDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 11);
}

/** Aplica a máscara 000.000.000-00 progressivamente. */
export function maskCpf(value: string): string {
  const d = cpfDigits(value);
  const parts = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9), d.slice(9, 11)];
  let out = parts[0];
  if (parts[1]) out += '.' + parts[1];
  if (parts[2]) out += '.' + parts[2];
  if (parts[3]) out += '-' + parts[3];
  return out;
}
