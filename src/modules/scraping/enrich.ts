import "server-only"
import Anthropic from "@anthropic-ai/sdk"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { scrapingLeads } from "@/db/schema"
import { serverEnv } from "@/lib/env"

/**
 * Enriquecimiento de un lead con Claude (§7 Fase 4, segunda pasada):
 * baja el HTML del sitio, lo recorta y extrae email/contacto/área/descripción.
 * Solo datos profesionales/de empresa (§4.3).
 */

const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    email: { type: "string", description: "Email de contacto de la empresa, o cadena vacía" },
    contactoNombre: { type: "string", description: "Nombre de una persona de contacto, o vacío" },
    contactoArea: { type: "string", description: "Área/cargo del contacto, o vacío" },
    descripcion: { type: "string", description: "Qué hace la empresa, 1-2 frases" },
  },
  required: ["email", "contactoNombre", "contactoArea", "descripcion"],
} as const

async function fetchSiteText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "PixsCRM-bot/1.0" },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    const html = await res.text()
    // Recorte simple: sacar scripts/estilos y tags; quedarnos con texto.
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 12_000)
  } catch {
    return null
  }
}

export async function enrichLead(leadId: string) {
  const env = serverEnv()
  if (!env.ANTHROPIC_API_KEY) throw new Error("Falta ANTHROPIC_API_KEY")

  const [lead] = await db.select().from(scrapingLeads).where(eq(scrapingLeads.id, leadId)).limit(1)
  if (!lead) throw new Error("Lead no encontrado")
  if (!lead.sitioWeb) return { skipped: true as const }

  const texto = await fetchSiteText(lead.sitioWeb)
  if (!texto) return { skipped: true as const }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    output_config: { format: { type: "json_schema", schema: EXTRACTION_SCHEMA } },
    messages: [
      {
        role: "user",
        content: `Del siguiente texto del sitio web de la empresa "${lead.nombre}", extraé datos profesionales de contacto. Si un dato no aparece, devolvé cadena vacía. Texto:\n\n${texto}`,
      },
    ],
  })

  const block = response.content.find((b) => b.type === "text")
  if (!block || block.type !== "text") return { skipped: true as const }
  const data = JSON.parse(block.text) as {
    email: string
    contactoNombre: string
    contactoArea: string
    descripcion: string
  }

  await db
    .update(scrapingLeads)
    .set({
      email: data.email || lead.email,
      contactoNombre: data.contactoNombre || null,
      contactoArea: data.contactoArea || null,
      descripcion: data.descripcion || lead.descripcion,
    })
    .where(eq(scrapingLeads.id, leadId))

  return { enriched: true as const }
}
