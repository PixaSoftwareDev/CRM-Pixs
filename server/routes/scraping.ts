import { eq } from "drizzle-orm"
import { Router } from "express"
import { z } from "zod"
import { db } from "@/db"
import { scrapingCampaigns, scrapingLeads } from "@/db/schema"
import { enrichLead } from "@/modules/scraping/enrich"
import { leadStats, listCampaigns, listLeads } from "@/modules/scraping/queries"
import { approveLead, runCampaign } from "@/modules/scraping/service"
import { audit } from "../lib/audit"
import { asyncHandler, parse } from "../lib/http"

export const scrapingRouter = Router()

// GET /api/scraping/campaigns
scrapingRouter.get(
  "/campaigns",
  asyncHandler(async (_req, res) => {
    res.json(await listCampaigns())
  }),
)

// GET /api/scraping/leads?campaignId=
scrapingRouter.get(
  "/leads",
  asyncHandler(async (req, res) => {
    const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : undefined
    res.json(await listLeads(campaignId))
  }),
)

// GET /api/scraping/leads/stats
scrapingRouter.get(
  "/leads/stats",
  asyncHandler(async (_req, res) => {
    res.json(await leadStats())
  }),
)

const campaignSchema = z.object({
  nombre: z.string().min(1).max(120),
  query: z.string().min(1).max(200),
  ubicacion: z.string().max(120).optional(),
  cantidad: z.coerce.number().int().min(1).max(20).default(20),
})

// POST /api/scraping/campaigns
scrapingRouter.post(
  "/campaigns",
  asyncHandler(async (req, res) => {
    const d = parse(campaignSchema, req.body)
    const [row] = await db
      .insert(scrapingCampaigns)
      .values({
        nombre: d.nombre,
        query: d.query,
        ubicacion: d.ubicacion || null,
        cantidad: d.cantidad,
        createdBy: req.user.id,
      })
      .returning({ id: scrapingCampaigns.id })
    await audit({
      userId: req.user.id,
      accion: "create",
      entityType: "scraping_campaign",
      entityId: row?.id,
    })
    res.status(201).json({ id: row?.id })
  }),
)

// POST /api/scraping/campaigns/:id/run  (Google Places → leads)
scrapingRouter.post(
  "/campaigns/:id/run",
  asyncHandler(async (req, res) => {
    const result = await runCampaign(req.params.id)
    res.json({ ok: true, ...result })
  }),
)

// POST /api/scraping/leads/:id/approve  (crea contacto + oportunidad)
scrapingRouter.post(
  "/leads/:id/approve",
  asyncHandler(async (req, res) => {
    const result = await approveLead(req.params.id)
    await audit({
      userId: req.user.id,
      accion: "update",
      entityType: "scraping_lead",
      entityId: req.params.id,
    })
    res.json({ ok: true, ...result })
  }),
)

// POST /api/scraping/leads/:id/discard
scrapingRouter.post(
  "/leads/:id/discard",
  asyncHandler(async (req, res) => {
    await db
      .update(scrapingLeads)
      .set({ estado: "descartado" })
      .where(eq(scrapingLeads.id, req.params.id))
    res.json({ ok: true })
  }),
)

// POST /api/scraping/leads/:id/enrich  (IA)
scrapingRouter.post(
  "/leads/:id/enrich",
  asyncHandler(async (req, res) => {
    const result = await enrichLead(req.params.id)
    res.json({ ok: true, ...result })
  }),
)

// DELETE /api/scraping/leads/:id
scrapingRouter.delete(
  "/leads/:id",
  asyncHandler(async (req, res) => {
    await db.delete(scrapingLeads).where(eq(scrapingLeads.id, req.params.id))
    await audit({
      userId: req.user.id,
      accion: "delete",
      entityType: "scraping_lead",
      entityId: req.params.id,
    })
    res.json({ ok: true })
  }),
)
