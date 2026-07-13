import { desc, eq } from "drizzle-orm"
import { db } from "@/db"
import { scrapingCampaigns, scrapingLeads } from "@/db/schema"

export async function listCampaigns() {
  return db.select().from(scrapingCampaigns).orderBy(desc(scrapingCampaigns.createdAt))
}

export async function listLeads(campaignId?: string) {
  const base = db.select().from(scrapingLeads).orderBy(desc(scrapingLeads.createdAt))
  if (campaignId) {
    return base.where(eq(scrapingLeads.campaignId, campaignId))
  }
  return base
}

/** Conversión: cuántos leads scrapeados terminaron como contacto/cliente (§7). */
export async function leadStats() {
  const leads = await db.select({ estado: scrapingLeads.estado }).from(scrapingLeads)
  const total = leads.length
  const aprobados = leads.filter((l) => l.estado === "aprobado").length
  return { total, aprobados }
}
