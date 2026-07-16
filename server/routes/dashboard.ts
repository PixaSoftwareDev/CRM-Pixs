import { Router } from "express"
import {
  coldOpportunities,
  homeCounts,
  pendingReimbursements,
  pipelineSummary,
  receivablesSummary,
  tasksNeedingAttention,
} from "@/modules/dashboard/queries"
import { asyncHandler } from "../lib/http"

export const dashboardRouter = Router()

// GET /api/dashboard/summary  → todo el resumen del home en un solo request
dashboardRouter.get(
  "/summary",
  asyncHandler(async (_req, res) => {
    const [counts, tasks, reimbursements, pipeline, cold, receivables] = await Promise.all([
      homeCounts(),
      tasksNeedingAttention(),
      pendingReimbursements(),
      pipelineSummary(),
      coldOpportunities(),
      receivablesSummary(),
    ])
    res.json({ counts, tasks, reimbursements, pipeline, cold, receivables })
  }),
)
