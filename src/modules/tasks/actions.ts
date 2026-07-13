"use server"

import { eq, max } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/db"
import { TASK_COLUMNS, type TaskColumn, tasks } from "@/db/schema"
import { requireUser } from "@/lib/auth"
import type { FormState } from "@/lib/forms"

const createSchema = z.object({
  projectId: z.string().uuid(),
  titulo: z.string().min(1).max(200),
})

export async function createTask(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser()
  const parsed = createSchema.safeParse({
    projectId: formData.get("projectId"),
    titulo: formData.get("titulo"),
  })
  if (!parsed.success) return { error: "El título es obligatorio" }

  const [{ maxOrden } = { maxOrden: null }] = await db
    .select({ maxOrden: max(tasks.orden) })
    .from(tasks)
    .where(eq(tasks.projectId, parsed.data.projectId))

  await db.insert(tasks).values({
    projectId: parsed.data.projectId,
    titulo: parsed.data.titulo,
    orden: (maxOrden ?? 0) + 1,
  })
  revalidatePath(`/proyectos/${parsed.data.projectId}`)
  return { ok: true }
}

/** Mueve una tarea a otra columna del kanban (drag&drop). */
export async function moveTask(id: string, estado: string, projectId: string) {
  await requireUser()
  if (!TASK_COLUMNS.includes(estado as TaskColumn)) return { error: "Columna inválida" }
  await db
    .update(tasks)
    .set({ estado: estado as TaskColumn })
    .where(eq(tasks.id, id))
  revalidatePath(`/proyectos/${projectId}`)
  return { ok: true }
}

export async function deleteTask(id: string, projectId: string) {
  await requireUser()
  await db.delete(tasks).where(eq(tasks.id, id))
  revalidatePath(`/proyectos/${projectId}`)
}
