import { eq } from "drizzle-orm"
import { Router } from "express"
import { z } from "zod"
import { db } from "@/db"
import { PROJECT_STATES, type ProjectState, projects, projectTechInfo } from "@/db/schema"
import { getProject, getTechInfo, listProjects } from "@/modules/projects/queries"
import { audit } from "../lib/audit"
import { asyncHandler, HttpError, parse } from "../lib/http"

export const projectsRouter = Router()

// GET /api/projects
projectsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await listProjects())
  }),
)

// GET /api/projects/:id
projectsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const p = await getProject(req.params.id)
    if (!p) throw new HttpError(404, "Proyecto no encontrado")
    res.json(p)
  }),
)

// PATCH /api/projects/:id/state  { estado }
const stateSchema = z.object({ estado: z.enum(PROJECT_STATES) })
projectsRouter.patch(
  "/:id/state",
  asyncHandler(async (req, res) => {
    const { estado } = parse(stateSchema, req.body)
    await db
      .update(projects)
      .set({ estado: estado as ProjectState })
      .where(eq(projects.id, req.params.id))
    await audit({
      userId: req.user.id,
      accion: "update",
      entityType: "project",
      entityId: req.params.id,
    })
    res.json({ ok: true })
  }),
)

// --- Info técnica ---

// GET /api/projects/:id/tech-info
projectsRouter.get(
  "/:id/tech-info",
  asyncHandler(async (req, res) => {
    res.json(await getTechInfo(req.params.id))
  }),
)

const techSchema = z.object({
  tipo: z.enum(["repo", "dominio", "deploy", "doc", "link"]),
  label: z.string().min(1).max(120),
  valor: z.string().min(1).max(500),
})

// POST /api/projects/:id/tech-info
projectsRouter.post(
  "/:id/tech-info",
  asyncHandler(async (req, res) => {
    const d = parse(techSchema, req.body)
    const [row] = await db
      .insert(projectTechInfo)
      .values({ projectId: req.params.id, ...d })
      .returning({ id: projectTechInfo.id })
    await audit({
      userId: req.user.id,
      accion: "create",
      entityType: "project_tech_info",
      entityId: req.params.id,
    })
    res.status(201).json({ id: row?.id })
  }),
)

// DELETE /api/projects/tech-info/:techId
projectsRouter.delete(
  "/tech-info/:techId",
  asyncHandler(async (req, res) => {
    await db.delete(projectTechInfo).where(eq(projectTechInfo.id, req.params.techId))
    res.json({ ok: true })
  }),
)
