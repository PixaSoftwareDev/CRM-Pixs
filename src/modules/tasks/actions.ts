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
  revalidatePath("/tareas")
  return { ok: true }
}

const createFromBoardSchema = z.object({
  projectId: z.string().uuid("Elegí un proyecto"),
  titulo: z.string().min(1, "Escribí un título").max(200),
  descripcion: z.string().max(2000).optional(),
  estado: z.enum(TASK_COLUMNS).default("backlog"),
  asignadoA: z.string().uuid().optional(),
  // Fechas ISO (yyyy-mm-dd) desde inputs date; se guardan como timestamp.
  createdAt: z.string().optional(),
  venceAt: z.string().optional(),
})

export type CreateTaskInput = z.input<typeof createFromBoardSchema>

/**
 * Crea una tarea desde la pestaña global con todos sus campos. Devuelve el id
 * y el createdAt efectivo para que el cliente la agregue sin recargar.
 */
export async function createTaskFromBoard(
  input: CreateTaskInput,
): Promise<{ ok: boolean; id?: string; createdAt?: Date; error?: string }> {
  await requireUser()
  const parsed = createFromBoardSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }
  const data = parsed.data

  // Fecha "estimada de resolución": el date input da yyyy-mm-dd; lo anclamos a mediodía
  // local para que no se corra de día por zona horaria.
  const toDate = (s?: string) => (s ? new Date(`${s}T12:00:00`) : undefined)
  const createdAt = toDate(data.createdAt) ?? new Date()

  const [{ maxOrden } = { maxOrden: null }] = await db
    .select({ maxOrden: max(tasks.orden) })
    .from(tasks)
    .where(eq(tasks.projectId, data.projectId))

  const [created] = await db
    .insert(tasks)
    .values({
      projectId: data.projectId,
      titulo: data.titulo,
      descripcion: data.descripcion || null,
      estado: data.estado,
      asignadoA: data.asignadoA || null,
      venceAt: toDate(data.venceAt) ?? null,
      cerradoAt: data.estado === "hecho" ? new Date() : null,
      createdAt,
      orden: (maxOrden ?? 0) + 1,
    })
    .returning({ id: tasks.id })

  revalidatePath(`/proyectos/${data.projectId}`)
  revalidatePath("/tareas")
  return { ok: true, id: created?.id, createdAt }
}

const updateSchema = createFromBoardSchema.extend({ id: z.string().uuid() })
export type UpdateTaskInput = z.input<typeof updateSchema>

/** Edita todos los campos de una tarea desde la pestaña global. */
export async function updateTask(input: UpdateTaskInput): Promise<{ ok: boolean; error?: string }> {
  await requireUser()
  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }
  const data = parsed.data
  const toDate = (s?: string) => (s ? new Date(`${s}T12:00:00`) : undefined)

  // Preserva la fecha de cierre si ya estaba terminada; la fija si recién pasa a "hecho".
  const [current] = await db
    .select({ cerradoAt: tasks.cerradoAt })
    .from(tasks)
    .where(eq(tasks.id, data.id))
    .limit(1)
  const cerradoAt = data.estado === "hecho" ? (current?.cerradoAt ?? new Date()) : null

  await db
    .update(tasks)
    .set({
      projectId: data.projectId,
      titulo: data.titulo,
      descripcion: data.descripcion || null,
      estado: data.estado,
      asignadoA: data.asignadoA || null,
      venceAt: toDate(data.venceAt) ?? null,
      createdAt: toDate(data.createdAt) ?? undefined,
      cerradoAt,
    })
    .where(eq(tasks.id, data.id))

  revalidatePath(`/proyectos/${data.projectId}`)
  revalidatePath("/tareas")
  return { ok: true }
}

/**
 * Aplica el cambio de estado a una tarea. Al pasar a "hecho" registra la fecha
 * de cierre; al sacarla de "hecho" la limpia. Devuelve error si la columna no es válida.
 */
async function applyStatus(id: string, estado: string): Promise<{ error?: string }> {
  if (!TASK_COLUMNS.includes(estado as TaskColumn)) return { error: "Columna inválida" }
  await db
    .update(tasks)
    .set({
      estado: estado as TaskColumn,
      cerradoAt: estado === "hecho" ? new Date() : null,
    })
    .where(eq(tasks.id, id))
  return {}
}

type StatusResult = { ok: boolean; error?: string }

/** Mueve una tarea a otra columna del kanban de un proyecto (drag&drop). */
export async function moveTask(
  id: string,
  estado: string,
  projectId: string,
): Promise<StatusResult> {
  await requireUser()
  const res = await applyStatus(id, estado)
  if (res.error) return { ok: false, error: res.error }
  revalidatePath(`/proyectos/${projectId}`)
  revalidatePath("/tareas")
  return { ok: true }
}

/** Cambia el estado desde la pestaña global de tareas (tablero o lista). */
export async function setTaskStatus(id: string, estado: string): Promise<StatusResult> {
  await requireUser()
  const res = await applyStatus(id, estado)
  if (res.error) return { ok: false, error: res.error }
  revalidatePath("/tareas")
  return { ok: true }
}

export async function deleteTask(id: string, projectId: string) {
  await requireUser()
  await db.delete(tasks).where(eq(tasks.id, id))
  revalidatePath(`/proyectos/${projectId}`)
  revalidatePath("/tareas")
}
