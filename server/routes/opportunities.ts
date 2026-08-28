import { eq } from "drizzle-orm"
import { Router } from "express"
import { db } from "@/db"
import { opportunities } from "@/db/schema"
import { addActivity } from "@/modules/activities"
import { getOpportunity, listOpportunities } from "@/modules/opportunities/queries"
import { moveSchema, opportunitySchema } from "@/modules/opportunities/schemas"
import { moveOpportunity } from "@/modules/opportunities/service"
import { ensureProjectForOpportunity } from "@/modules/projects/service"
import { audit } from "../lib/audit"
import { asyncHandler, HttpError, parse } from "../lib/http"

export const opportunitiesRouter = Router()

// GET /api/opportunities
opportunitiesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await listOpportunities())
  }),
)

// GET /api/opportunities/:id
opportunitiesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const o = await getOpportunity(req.params.id)
    if (!o) throw new HttpError(404, "Oportunidad no encontrada")
    res.json(o)
  }),
)

// POST /api/opportunities
opportunitiesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const d = parse(opportunitySchema, req.body)
    const [row] = await db
      .insert(opportunities)
      .values({
        contactId: d.contactId,
        titulo: d.titulo,
        valorEstimado: d.valorEstimado?.toString() ?? null,
        probabilidad: d.probabilidad?.toString() ?? null,
        moneda: d.moneda,
      })
      .returning({ id: opportunities.id })
    if (!row) throw new Error("No se pudo crear la oportunidad")
    await addActivity({
      tipo: "nota",
      entityType: "opportunity",
      entityId: row.id,
      contenido: "Oportunidad creada",
      autorId: req.user.id,
    })
    await audit({
      userId: req.user.id,
      accion: "create",
      entityType: "opportunity",
      entityId: row?.id,
    })
    res.status(201).json({ id: row?.id })
  }),
)

// PATCH /api/opportunities/:id
opportunitiesRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const d = parse(opportunitySchema, req.body)
    await db
      .update(opportunities)
      .set({
        contactId: d.contactId,
        titulo: d.titulo,
        valorEstimado: d.valorEstimado?.toString() ?? null,
        probabilidad: d.probabilidad?.toString() ?? null,
        moneda: d.moneda,
        updatedAt: new Date(),
      })
      .where(eq(opportunities.id, req.params.id))
    await audit({
      userId: req.user.id,
      accion: "update",
      entityType: "opportunity",
      entityId: req.params.id,
    })
    res.json({ id: req.params.id })
  }),
)

// DELETE /api/opportunities/:id
opportunitiesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await db.delete(opportunities).where(eq(opportunities.id, req.params.id))
    await audit({
      userId: req.user.id,
      accion: "delete",
      entityType: "opportunity",
      entityId: req.params.id,
    })
    res.json({ ok: true })
  }),
)

// POST /api/opportunities/:id/move  { estado, motivoPerdida? }
opportunitiesRouter.post(
  "/:id/move",
  asyncHandler(async (req, res) => {
    const d = parse(moveSchema, { ...req.body, id: req.params.id })
    await moveOpportunity({
      id: d.id,
      estado: d.estado,
      motivoPerdida: d.motivoPerdida,
      autorId: req.user.id,
      onConfirmed: (oppId) => ensureProjectForOpportunity(oppId, req.user.id),
    })
    await audit({
      userId: req.user.id,
      accion: "update",
      entityType: "opportunity",
      entityId: d.id,
      cambios: { estado: d.estado },
    })
    res.json({ ok: true })
  }),
)
