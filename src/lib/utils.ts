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

/**
 * "yyyy-mm-dd" es una fecha sin hora: hay que interpretarla en hora local.
 * new Date("2026-09-01") la toma como medianoche UTC y en GMT-3 cae al 31/08.
 */
function parseDate(date: Date | string) {
  if (typeof date !== "string") return date
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return new Date(date)
}

export function formatDate(date: Date | string | null | undefined) {
  if (!date) return "—"
  return DATE.format(parseDate(date))
}

/** Días hasta una fecha (negativo = vencido). */
export function daysUntil(date: Date | string) {
  const diff = parseDate(date).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

/** Hoy en "yyyy-mm-dd" según la hora local (toISOString ya es mañana pasadas las 21 en AR). */
export function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
