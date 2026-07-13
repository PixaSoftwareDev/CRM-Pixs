"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { ACTIVITY_ENTITIES } from "@/db/schema"
import { requireUser } from "@/lib/auth"
import { addActivity } from "./index"

const noteSchema = z.object({
  entityType: z.enum(ACTIVITY_ENTITIES),
  entityId: z.string().uuid(),
  contenido: z.string().min(1, "Escribí algo").max(5000),
  revalidate: z.string().optional(),
})

export type NoteState = { error?: string; ok?: boolean }

export async function addNoteAction(_prev: NoteState, formData: FormData): Promise<NoteState> {
  const user = await requireUser()
  const parsed = noteSchema.safeParse({
    entityType: formData.get("entityType"),
    entityId: formData.get("entityId"),
    contenido: formData.get("contenido"),
    revalidate: formData.get("revalidate") ?? undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" }

  await addActivity({
    tipo: "nota",
    entityType: parsed.data.entityType,
    entityId: parsed.data.entityId,
    contenido: parsed.data.contenido,
    autorId: user.id,
  })

  if (parsed.data.revalidate) revalidatePath(parsed.data.revalidate)
  return { ok: true }
}
