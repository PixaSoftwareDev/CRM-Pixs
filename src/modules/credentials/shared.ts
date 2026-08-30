/**
 * El tipo de acceso es texto libre: cada uno escribe lo que le sirve ("vps",
 * "hosting", "panel de dominio"…). Se guarda siempre en minúsculas para que
 * "VPS" y "vps" no queden como dos tipos distintos, y el formulario sugiere
 * los que ya existen para no multiplicar variantes de lo mismo.
 */

/** Normaliza lo escrito: sin espacios de más y en minúsculas. */
export function normalizarTipo(valor: string) {
  return valor.trim().toLowerCase().replace(/\s+/g, " ")
}

const TONOS = ["blue", "green", "violet", "amber", "red", "neutral"] as const
export type CredentialTone = (typeof TONOS)[number]

/**
 * Color estable para un tipo: el mismo texto siempre da el mismo color, sin
 * necesidad de una tabla fija de tipos.
 */
export function tonoDeTipo(tipo: string): CredentialTone {
  let suma = 0
  for (let i = 0; i < tipo.length; i++) suma = (suma + tipo.charCodeAt(i)) % 997
  return TONOS[suma % TONOS.length] ?? "neutral"
}

/** Para mostrar: primera letra en mayúscula, el resto como se guardó. */
export function etiquetaDeTipo(tipo: string) {
  return tipo.charAt(0).toUpperCase() + tipo.slice(1)
}

/** Sugerencias iniciales cuando todavía no hay accesos cargados. */
export const TIPOS_SUGERIDOS = ["servidor", "base de datos", "servicio", "panel", "email"] as const
