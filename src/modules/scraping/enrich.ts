import "server-only"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { scrapingLeads } from "@/db/schema"
import { serverEnv } from "@/lib/env"

/**
 * Enriquecimiento de un lead con Gemini (Google AI Studio, §7 Fase 4): baja el
 * HTML del sitio, lo recorta y extrae email/contacto/área/descripción con salida
 * JSON estructurada. Solo datos profesionales/de empresa (§4.3).
 */

const GEMINI_MODEL = "gemini-2.0-flash"
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

// Esquema en el formato de Gemini (Schema/OpenAPI: tipos en mayúscula).
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    email: { type: "STRING", description: "Email de contacto de la empresa, o cadena vacía" },
    contactoNombre: { type: "STRING", description: "Nombre de una persona de contacto, o vacío" },
    contactoArea: { type: "STRING", description: "Área/cargo del contacto, o vacío" },
    descripcion: { type: "STRING", description: "Qué hace la empresa, 1-2 frases" },
  },
  required: ["email", "contactoNombre", "contactoArea", "descripcion"],
}

type Extraction = {
  email: string
  contactoNombre: string
  contactoArea: string
  descripcion: string
}

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

/** Llama a Gemini con salida JSON estructurada y devuelve la extracción. */
async function extractWithGemini(
  apiKey: string,
  nombre: string,
  texto: string,
): Promise<Extraction | null> {
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: `Del siguiente texto del sitio web de la empresa "${nombre}", extraé datos profesionales de contacto. Si un dato no aparece, devolvé cadena vacía. Texto:\n\n${texto}`,
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`Gemini respondió ${res.status}: ${await res.text()}`)

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) return null
  try {
    return JSON.parse(text) as Extraction
  } catch {
    return null
  }
}

export async function enrichLead(leadId: string) {
  const env = serverEnv()
  if (!env.GEMINI_API_KEY) throw new Error("Falta GEMINI_API_KEY")

  const [lead] = await db.select().from(scrapingLeads).where(eq(scrapingLeads.id, leadId)).limit(1)
  if (!lead) throw new Error("Lead no encontrado")
  if (!lead.sitioWeb) return { skipped: true as const }

  const texto = await fetchSiteText(lead.sitioWeb)
  if (!texto) return { skipped: true as const }

  const data = await extractWithGemini(env.GEMINI_API_KEY, lead.nombre, texto)
  if (!data) return { skipped: true as const }

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
