import { eq, max } from "drizzle-orm"
import { Router } from "express"
import { z } from "zod"
import { db } from "@/db"
import { TASK_COLORS, TASK_COLUMNS, type TaskColumn, tasks } from "@/db/schema"
import { serializeAsignados } from "@/modules/tasks/assignees"
import { listAllTasks, listTasks } from "@/modules/tasks/queries"
import { asyncHandler, HttpError, parse } from "../lib/http"

export const tasksRouter = Router()

const toDate = (s?: string) => (s ? new Date(`${s}T12:00:00`) : undefined)

// GET /api/tasks  (todas, con proyecto)
tasksRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await listAllTasks())
  }),
)

const boardSchema = z.object({
  projectId: z.string().uuid("Elegí un proyecto"),
  titulo: z.string().min(1, "Escribí un título").max(200),
  descripcion: z.string().max(2000).optional(),
  color: z.enum(TASK_COLORS).nullable().optional(),
  estado: z.enum(TASK_COLUMNS).default("backlog"),
  asignados: z.array(z.string().uuid()).optional(),
  createdAt: z.string().optional(),
  venceAt: z.string().optional(),
})

// POST /api/tasks  (crea con todos los campos)
tasksRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const d = parse(boardSchema, req.body)
    const createdAt = toDate(d.createdAt) ?? new Date()
    const [{ maxOrden } = { maxOrden: null }] = await db
      .select({ maxOrden: max(tasks.orden) })
      .from(tasks)
      .where(eq(tasks.projectId, d.projectId))
    const [row] = await db
      .insert(tasks)
      .values({
        projectId: d.projectId,
        titulo: d.titulo,
        descripcion: d.descripcion || null,
        color: d.color ?? null,
        estado: d.estado,
        asignados: serializeAsignados(d.asignados),
        venceAt: toDate(d.venceAt) ?? null,
        cerradoAt: d.estado === "hecho" ? new Date() : null,
        createdAt,
        orden: (maxOrden ?? 0) + 1,
      })
      .returning({ id: tasks.id })
    res.status(201).json({ id: row?.id, createdAt })
  }),
)

const updateSchema = boardSchema.extend({ estado: z.enum(TASK_COLUMNS) })

// PATCH /api/tasks/:id
tasksRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const d = parse(updateSchema, req.body)
    const [current] = await db
      .select({ cerradoAt: tasks.cerradoAt })
      .from(tasks)
      .where(eq(tasks.id, req.params.id))
      .limit(1)
    const cerradoAt = d.estado === "hecho" ? (current?.cerradoAt ?? new Date()) : null
    await db
      .update(tasks)
      .set({
        projectId: d.projectId,
        titulo: d.titulo,
        descripcion: d.descripcion || null,
        color: d.color ?? null,
        estado: d.estado,
        asignados: serializeAsignados(d.asignados),
        venceAt: toDate(d.venceAt) ?? null,
        createdAt: toDate(d.createdAt) ?? undefined,
        cerradoAt,
      })
      .where(eq(tasks.id, req.params.id))
    res.json({ ok: true })
  }),
)

const statusSchema = z.object({ estado: z.enum(TASK_COLUMNS) })

async function applyStatus(id: string, estado: TaskColumn) {
  await db
    .update(tasks)
    .set({ estado, cerradoAt: estado === "hecho" ? new Date() : null })
    .where(eq(tasks.id, id))
}

// POST /api/tasks/:id/status  { estado }
tasksRouter.post(
  "/:id/status",
  asyncHandler(async (req, res) => {
    const { estado } = parse(statusSchema, req.body)
    await applyStatus(req.params.id, estado)
    res.json({ ok: true })
  }),
)

// POST /api/tasks/:id/move  { estado }  (alias de status; el projectId no es necesario en REST)
tasksRouter.post(
  "/:id/move",
  asyncHandler(async (req, res) => {
    const { estado } = parse(statusSchema, req.body)
    await applyStatus(req.params.id, estado)
    res.json({ ok: true })
  }),
)

// DELETE /api/tasks/:id
tasksRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await db.delete(tasks).where(eq(tasks.id, req.params.id))
    res.json({ ok: true })
  }),
)

// GET /api/tasks/by-project/:projectId  (tareas de un proyecto)
tasksRouter.get(
  "/by-project/:projectId",
  asyncHandler(async (req, res) => {
    if (!req.params.projectId) throw new HttpError(400, "Falta projectId")
    res.json(await listTasks(req.params.projectId))
  }),
)
