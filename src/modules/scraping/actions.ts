"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/db"
import { scrapingCampaigns, scrapingLeads } from "@/db/schema"
import { audit, requireUser } from "@/lib/auth"
import type { FormState } from "@/lib/forms"
import { enrichLead } from "./enrich"
import { approveLead, runCampaign } from "./service"

const campaignSchema = z.object({
  nombre: z.string().min(1).max(120),
  query: z.string().min(1).max(200),
  ubicacion: z.string().max(120).optional().or(z.literal("")),
  cantidad: z.coerce.number().int().min(1).max(20),
})

export async function createCampaign(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser()
  const parsed = campaignSchema.safeParse({
    nombre: formData.get("nombre"),
    query: formData.get("query"),
    ubicacion: formData.get("ubicacion") ?? "",
    cantidad: formData.get("cantidad") || 20,
  })
  if (!parsed.success) return { error: "Datos inválidos" }

  const [row] = await db
    .insert(scrapingCampaigns)
    .values({
      nombre: parsed.data.nombre,
      query: parsed.data.query,
      ubicacion: parsed.data.ubicacion || null,
      cantidad: parsed.data.cantidad,
      createdBy: user.id,
    })
    .returning({ id: scrapingCampaigns.id })

  await audit({
    userId: user.id,
    accion: "create",
    entityType: "scraping_campaign",
    entityId: row?.id,
  })
  revalidatePath("/captacion")
  return { ok: true, id: row?.id }
}

/** Corre la recolección (Google Places). En prod: mover a job durable. */
export async function runCampaignAction(id: string) {
  await requireUser()
  try {
    const res = await runCampaign(id)
    revalidatePath("/captacion")
    return { ok: true, ...res }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al correr la campaña" }
  }
}

export async function approveLeadAction(id: string) {
  const user = await requireUser()
  await approveLead(id)
  await audit({ userId: user.id, accion: "update", entityType: "scraping_lead", entityId: id })
  revalidatePath("/captacion")
  revalidatePath("/pipeline")
  return { ok: true }
}

export async function discardLeadAction(id: string) {
  await requireUser()
  await db.update(scrapingLeads).set({ estado: "descartado" }).where(eq(scrapingLeads.id, id))
  revalidatePath("/captacion")
  return { ok: true }
}

/** Elimina definitivamente un lead de la bandeja. */
export async function deleteLeadAction(id: string) {
  const user = await requireUser()
  await db.delete(scrapingLeads).where(eq(scrapingLeads.id, id))
  await audit({ userId: user.id, accion: "delete", entityType: "scraping_lead", entityId: id })
  revalidatePath("/captacion")
  return { ok: true }
}

export async function enrichLeadAction(id: string) {
  await requireUser()
  try {
    const res = await enrichLead(id)
    revalidatePath("/captacion")
    return { ok: true, ...res }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al enriquecer" }
  }
}
