"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/db"
import { contacts } from "@/db/schema"
import { audit, requireUser } from "@/lib/auth"
import { cleanContact, contactSchema } from "./schemas"

export type ActionState = { error?: string; ok?: boolean; id?: string }

function parse(formData: FormData) {
  return contactSchema.safeParse({
    nombre: formData.get("nombre"),
    empresa: formData.get("empresa") ?? "",
    email: formData.get("email") ?? "",
    telefono: formData.get("telefono") ?? "",
    sitioWeb: formData.get("sitioWeb") ?? "",
    notas: formData.get("notas") ?? "",
  })
}

export async function createContact(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const parsed = parse(formData)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" }

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
  const parsed = parse(formData)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" }

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
