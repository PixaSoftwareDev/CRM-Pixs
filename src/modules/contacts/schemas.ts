import { z } from "zod"

// Web amigable: aceptamos dominio pelado ("www.pixs.com.ar" o "pixs.com.ar") y
// le agregamos https:// si no trae esquema, antes de validar que sea una URL.
const sitioWeb = z.preprocess(
  (v) => {
    if (typeof v !== "string") return v
    const t = v.trim()
    if (!t) return ""
    return /^https?:\/\//i.test(t) ? t : `https://${t}`
  },
  z.string().url("Poné una web válida, ej: www.pixs.com.ar").or(z.literal("")),
)

export const contactSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio").max(200),
  personaContacto: z.string().max(200).optional().or(z.literal("")),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  telefono: z.string().max(50).optional().or(z.literal("")),
  sitioWeb,
  notas: z.string().max(5000).optional().or(z.literal("")),
})

export type ContactInput = z.infer<typeof contactSchema>

/** Normaliza los "" a null para la base. */
export function cleanContact(input: ContactInput) {
  const nullify = (v?: string) => (v && v.length > 0 ? v : null)
  return {
    nombre: input.nombre,
    personaContacto: nullify(input.personaContacto),
    email: nullify(input.email),
    telefono: nullify(input.telefono),
    sitioWeb: nullify(input.sitioWeb),
    notas: nullify(input.notas),
  }
}
