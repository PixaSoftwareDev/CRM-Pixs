/**
 * Plata a la vista solo de quien tiene acceso a Finanzas. Las respuestas que
 * mezclan datos de otros sectores con montos (saldo del cliente, monto de la
 * venta, actividad de cobros) los omiten o tapan para el resto.
 */

/** Tipos de actividad que son movimientos de cuenta corriente: no se muestran sin Finanzas. */
export const FINANCE_ACTIVITY_KINDS = ["cobro", "factura"] as const;

/** Cómo se ve un monto tapado. */
export const HIDDEN_AMOUNT = "$ •••";

/** Montos como los escribe el sistema ("$ 45.000", "-$ 1.234,50", "$45000"). */
const AMOUNT = /-?\$\s?\d[\d.,]*/g;

/** Tapa los montos dentro de un texto libre (títulos de tareas, actividad…). */
export function redactAmounts<T extends string | null>(text: T): T {
  return (text === null ? null : text.replace(AMOUNT, HIDDEN_AMOUNT)) as T;
}

/** ¿Esta actividad se le muestra a alguien sin Finanzas? */
export const isFinanceActivity = (kind: string): boolean => (FINANCE_ACTIVITY_KINDS as readonly string[]).includes(kind);
