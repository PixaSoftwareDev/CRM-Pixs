"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/db"
import { contactPeople } from "@/db/schema"
import { audit, requireUser } from "@/lib/auth"
import type { FormState } from "@/lib/forms"

const personSchema = z.object({
  contactId: z.string().uuid(),
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  puesto: z.string().trim().max(120).optional(),
  email: z.string().trim().max(200).optional(),
  telefono: z.string().trim().max(60).optional(),
})

/** Agrega una persona de contacto a un cliente. */
export async function addContactPerson(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser()
  const parsed = personSchema.safeParse({
    contactId: formData.get("contactId"),
    nombre: formData.get("nombre"),
    puesto: formData.get("puesto") || undefined,
    email: formData.get("email") || undefined,
    telefono: formData.get("telefono") || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" }

  const { contactId, nombre, puesto, email, telefono } = parsed.data
  await db.insert(contactPeople).values({
    contactId,
    nombre,
    puesto: puesto || null,
    email: email || null,
    telefono: telefono || null,
  })

  await audit({ userId: user.id, accion: "create", entityType: "contact_person" })
  revalidatePath(`/contactos/${contactId}`)
  return { ok: true }
}

/** Elimina una persona de contacto. */
export async function deleteContactPerson(id: string, contactId: string): Promise<FormState> {
  const user = await requireUser()
  await db.delete(contactPeople).where(eq(contactPeople.id, id))
  await audit({ userId: user.id, accion: "delete", entityType: "contact_person", entityId: id })
  revalidatePath(`/contactos/${contactId}`)
  return { ok: true }
}
