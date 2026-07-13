import { z } from "zod"

export const contactSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio").max(200),
  empresa: z.string().max(200).optional().or(z.literal("")),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  telefono: z.string().max(50).optional().or(z.literal("")),
  sitioWeb: z.string().url("URL inválida").optional().or(z.literal("")),
  notas: z.string().max(5000).optional().or(z.literal("")),
})

export type ContactInput = z.infer<typeof contactSchema>

/** Normaliza los "" a null para la base. */
export function cleanContact(input: ContactInput) {
  const nullify = (v?: string) => (v && v.length > 0 ? v : null)
  return {
    nombre: input.nombre,
    empresa: nullify(input.empresa),
    email: nullify(input.email),
    telefono: nullify(input.telefono),
    sitioWeb: nullify(input.sitioWeb),
    notas: nullify(input.notas),
  }
}
