import { Router } from "express"
import { z } from "zod"
import { ACTIVITY_ENTITIES } from "@/db/schema"
import { addActivity, listActivities } from "@/modules/activities"
import { asyncHandler, parse } from "../lib/http"

export const activitiesRouter = Router()

const listQuery = z.object({
  entityType: z.enum(ACTIVITY_ENTITIES),
  entityId: z.string().uuid(),
})

// GET /api/activities?entityType=&entityId=
activitiesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { entityType, entityId } = parse(listQuery, req.query)
    res.json(await listActivities(entityType, entityId))
  }),
)

const noteSchema = z.object({
  entityType: z.enum(ACTIVITY_ENTITIES),
  entityId: z.string().uuid(),
  contenido: z.string().min(1, "Escribí algo").max(5000),
})

// POST /api/activities/note
activitiesRouter.post(
  "/note",
  asyncHandler(async (req, res) => {
    const d = parse(noteSchema, req.body)
    await addActivity({
      tipo: "nota",
      entityType: d.entityType,
      entityId: d.entityId,
      contenido: d.contenido,
      autorId: req.user.id,
    })
    res.status(201).json({ ok: true })
  }),
)
