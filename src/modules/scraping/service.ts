import { and, eq, or } from "drizzle-orm"
import { db } from "@/db"
import { contacts, opportunities, scrapingCampaigns, scrapingLeads } from "@/db/schema"
import { searchPlaces } from "./places"

/**
 * Corre una campaña: recolecta con Google Places y vuelca a la bandeja de leads,
 * marcando duplicados contra contactos y leads existentes (§7 Fase 4).
 * En producción esto conviene moverlo a un job durable (Inngest/Trigger.dev).
 */
export async function runCampaign(campaignId: string) {
  const [campaign] = await db
    .select()
    .from(scrapingCampaigns)
    .where(eq(scrapingCampaigns.id, campaignId))
    .limit(1)
  if (!campaign) throw new Error("Campaña no encontrada")

  await db
    .update(scrapingCampaigns)
    .set({ estado: "corriendo" })
    .where(eq(scrapingCampaigns.id, campaignId))

  try {
    const q = campaign.ubicacion ? `${campaign.query} en ${campaign.ubicacion}` : campaign.query
    const places = await searchPlaces(q, campaign.cantidad)

    for (const p of places) {
      const dup = await isDuplicate(p.sitioWeb, p.telefono)
      await db.insert(scrapingLeads).values({
        campaignId,
        nombre: p.nombre,
        telefono: p.telefono,
        sitioWeb: p.sitioWeb,
        direccion: p.direccion,
        estado: dup ? "duplicado" : "nuevo",
      })
    }

    await db
      .update(scrapingCampaigns)
      .set({ estado: "completada" })
      .where(eq(scrapingCampaigns.id, campaignId))
    return { insertados: places.length }
  } catch (err) {
    await db
      .update(scrapingCampaigns)
      .set({ estado: "error" })
      .where(eq(scrapingCampaigns.id, campaignId))
    throw err
  }
}

/** Dedup: ¿ya existe un contacto o lead con este sitio web o teléfono? */
async function isDuplicate(sitioWeb?: string | null, telefono?: string | null) {
  if (!sitioWeb && !telefono) return false

  const contactConds = []
  if (sitioWeb) contactConds.push(eq(contacts.sitioWeb, sitioWeb))
  if (telefono) contactConds.push(eq(contacts.telefono, telefono))
  const [c] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(or(...contactConds))
    .limit(1)
  if (c) return true

  const leadConds = []
  if (sitioWeb) leadConds.push(eq(scrapingLeads.sitioWeb, sitioWeb))
  if (telefono) leadConds.push(eq(scrapingLeads.telefono, telefono))
  const [l] = await db
    .select({ id: scrapingLeads.id })
    .from(scrapingLeads)
    .where(and(or(...leadConds), eq(scrapingLeads.estado, "aprobado")))
    .limit(1)
  return Boolean(l)
}

/**
 * Aprueba un lead: crea el contacto (con sello de origen "scraping") y una
 * oportunidad en estado "posible", ligada a la campaña (§7 Fase 4).
 */
export async function approveLead(leadId: string) {
  const [lead] = await db.select().from(scrapingLeads).where(eq(scrapingLeads.id, leadId)).limit(1)
  if (!lead) throw new Error("Lead no encontrado")
  if (lead.contactId) return { contactId: lead.contactId }

  const notas = [lead.descripcion, lead.direccion].filter(Boolean).join(" · ") || null

  const [contact] = await db
    .insert(contacts)
    .values({
      nombre: lead.nombre,
      email: lead.email,
      telefono: lead.telefono,
      sitioWeb: lead.sitioWeb,
      personaContacto: lead.contactoNombre,
      notas,
      source: "scraping",
    })
    .returning({ id: contacts.id })
  if (!contact) throw new Error("No se pudo crear el contacto")

  await db.insert(opportunities).values({
    contactId: contact.id,
    titulo: `Prospecto: ${lead.nombre}`,
    estado: "nuevo",
    scrapingCampaignId: lead.campaignId,
  })

  await db
    .update(scrapingLeads)
    .set({ estado: "aprobado", contactId: contact.id })
    .where(eq(scrapingLeads.id, leadId))

  return { contactId: contact.id }
}
