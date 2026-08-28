"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/db"
import { type OpportunityState, opportunities } from "@/db/schema"
import { audit, requireUser } from "@/lib/auth"
import { addActivity } from "@/modules/activities"
import { ensureProjectForOpportunity } from "@/modules/projects/service"
import { moveSchema, opportunitySchema } from "./schemas"
import { moveOpportunity } from "./service"

export type ActionState = { error?: string; ok?: boolean; id?: string }

export async function createOpportunity(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  const parsed = opportunitySchema.safeParse({
    contactId: formData.get("contactId"),
    titulo: formData.get("titulo"),
    valorEstimado: formData.get("valorEstimado") || undefined,
    probabilidad: formData.get("probabilidad") || undefined,
    moneda: formData.get("moneda") || "ARS",
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" }

  const [row] = await db
    .insert(opportunities)
    .values({
      contactId: parsed.data.contactId,
      titulo: parsed.data.titulo,
      valorEstimado: parsed.data.valorEstimado?.toString(),
      probabilidad: parsed.data.probabilidad?.toString(),
      moneda: parsed.data.moneda,
    })
    .returning({ id: opportunities.id })
  if (!row) throw new Error("No se pudo crear la oportunidad")

  await addActivity({
    tipo: "nota",
    entityType: "opportunity",
    entityId: row.id,
    contenido: "Oportunidad creada",
    autorId: user.id,
  })
  await audit({ userId: user.id, accion: "create", entityType: "opportunity", entityId: row?.id })
  revalidatePath("/pipeline")
  return { ok: true, id: row?.id }
}

/** Edita los datos de una oportunidad (no el estado, que se mueve por el kanban). */
export async function updateOpportunity(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  const id = String(formData.get("id") ?? "")
  const parsed = opportunitySchema.safeParse({
    contactId: formData.get("contactId"),
    titulo: formData.get("titulo"),
    valorEstimado: formData.get("valorEstimado") || undefined,
    probabilidad: formData.get("probabilidad") || undefined,
    moneda: formData.get("moneda") || "ARS",
  })
  if (!id) return { error: "Falta el id de la oportunidad" }
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" }

  await db
    .update(opportunities)
    .set({
      contactId: parsed.data.contactId,
      titulo: parsed.data.titulo,
      valorEstimado: parsed.data.valorEstimado?.toString() ?? null,
      probabilidad: parsed.data.probabilidad?.toString() ?? null,
      moneda: parsed.data.moneda,
      updatedAt: new Date(),
    })
    .where(eq(opportunities.id, id))

  await audit({ userId: user.id, accion: "update", entityType: "opportunity", entityId: id })
  revalidatePath("/pipeline")
  revalidatePath(`/pipeline/${id}`)
  return { ok: true, id }
}

/** Elimina una oportunidad. Si tiene proyecto asociado, el FK lo borra en cascada. */
export async function deleteOpportunity(id: string) {
  const user = await requireUser()
  await db.delete(opportunities).where(eq(opportunities.id, id))
  await audit({ userId: user.id, accion: "delete", entityType: "opportunity", entityId: id })
  revalidatePath("/pipeline")
}

/** Mueve una oportunidad de estado (usado por el drag&drop del kanban). */
export async function moveOpportunityAction(id: string, estado: string, motivoPerdida?: string) {
  const user = await requireUser()
  const parsed = moveSchema.safeParse({ id, estado, motivoPerdida })
  if (!parsed.success) return { error: "Estado inválido" }

  await moveOpportunity({
    id: parsed.data.id,
    estado: parsed.data.estado as OpportunityState,
    motivoPerdida: parsed.data.motivoPerdida,
    autorId: user.id,
    // Al confirmar, se crea el proyecto (Fase 2).
    onConfirmed: (oppId) => ensureProjectForOpportunity(oppId, user.id),
  })

  await audit({
    userId: user.id,
    accion: "update",
    entityType: "opportunity",
    entityId: id,
    cambios: { estado: [null, estado] },
  })
  revalidatePath("/pipeline")
  revalidatePath(`/pipeline/${id}`)
  return { ok: true }
}
