import { Router } from "express"
import {
  homeCounts,
  pendingReimbursements,
  receivablesSummary,
  tasksNeedingAttention,
} from "@/modules/dashboard/queries"
import { asyncHandler } from "../lib/http"

export const dashboardRouter = Router()

// GET /api/dashboard/summary  → todo el resumen del home en un solo request
dashboardRouter.get(
  "/summary",
  asyncHandler(async (_req, res) => {
    const [counts, tasks, reimbursements, receivables] = await Promise.all([
      homeCounts(),
      tasksNeedingAttention(),
      pendingReimbursements(),
      receivablesSummary(),
    ])
    // pipeline/cold vacíos: las oportunidades se dieron de baja, pero el
    // conector externo (Intellix) espera estas claves en la respuesta.
    res.json({ counts, tasks, reimbursements, pipeline: [], cold: [], receivables })
  }),
)
