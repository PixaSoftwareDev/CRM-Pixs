import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/** Une clases de Tailwind resolviendo conflictos (patrón shadcn). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const CURRENCY = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" })

export function formatMoney(monto: number | string, moneda = "ARS") {
  const value = typeof monto === "string" ? Number(monto) : monto
  if (moneda === "ARS") return CURRENCY.format(value)
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: moneda }).format(value)
}

const DATE = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })

export function formatDate(date: Date | string | null | undefined) {
  if (!date) return "—"
  return DATE.format(typeof date === "string" ? new Date(date) : date)
}

/** Días hasta una fecha (negativo = vencido). */
export function daysUntil(date: Date | string) {
  const target = typeof date === "string" ? new Date(date) : date
  const diff = target.getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}
