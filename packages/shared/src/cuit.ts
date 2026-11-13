const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;

/** Deja solo los dígitos ("30-71234567-8" → "30712345678"). */
export function normalizeCuit(value: string): string {
  return value.replace(/\D/g, "");
}

/** Valida longitud, prefijo y dígito verificador (módulo 11) de un CUIT/CUIL. */
export function isValidCuit(value: string): boolean {
  const digits = normalizeCuit(value);
  if (!/^(20|23|24|27|30|33|34)\d{9}$/.test(digits)) return false;

  const sum = WEIGHTS.reduce((acc, w, i) => acc + w * Number(digits[i]), 0);
  const mod = 11 - (sum % 11);
  const check = mod === 11 ? 0 : mod === 10 ? 9 : mod;
  return check === Number(digits[10]);
}

/** "30712345678" → "30-71234567-8". */
export function formatCuit(value: string): string {
  const d = normalizeCuit(value);
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : value;
}
