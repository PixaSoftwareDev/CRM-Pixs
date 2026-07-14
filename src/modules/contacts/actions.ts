"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/db"
import { contacts } from "@/db/schema"
import { audit, requireUser } from "@/lib/auth"
import { cleanContact, contactSchema } from "./schemas"

export type ContactValues = {
  nombre: string
  personaContacto: string
  email: string
  telefono: string
  sitioWeb: string
  notas: string
}

// `values` conserva lo tipeado para repoblar el form si la validación falla
// (React 19 resetea el <form> al terminar el action; sin esto se borraría todo).
export type ActionState = { error?: string; ok?: boolean; id?: string; values?: ContactValues }

function rawValues(formData: FormData): ContactValues {
  const str = (k: string) => String(formData.get(k) ?? "")
  return {
    nombre: str("nombre"),
    personaContacto: str("personaContacto"),
    email: str("email"),
    telefono: str("telefono"),
    sitioWeb: str("sitioWeb"),
    notas: str("notas"),
  }
}

function parse(values: ContactValues) {
  return contactSchema.safeParse(values)
}

export async function createContact(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const values = rawValues(formData)
  const parsed = parse(values)
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", values }

  const [row] = await db
    .insert(contacts)
    .values({ ...cleanContact(parsed.data), source: "manual" })
    .returning({ id: contacts.id })

  await audit({ userId: user.id, accion: "create", entityType: "contact", entityId: row?.id })
  revalidatePath("/contactos")
  return { ok: true, id: row?.id }
}

export async function updateContact(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  const values = rawValues(formData)
  const parsed = parse(values)
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", values }

  await db
    .update(contacts)
    .set({ ...cleanContact(parsed.data), updatedAt: new Date() })
    .where(eq(contacts.id, id))

  await audit({ userId: user.id, accion: "update", entityType: "contact", entityId: id })
  revalidatePath("/contactos")
  revalidatePath(`/contactos/${id}`)
  return { ok: true, id }
}

export async function deleteContact(id: string) {
  const user = await requireUser()
  await db.delete(contacts).where(eq(contacts.id, id))
  await audit({ userId: user.id, accion: "delete", entityType: "contact", entityId: id })
  revalidatePath("/contactos")
}
