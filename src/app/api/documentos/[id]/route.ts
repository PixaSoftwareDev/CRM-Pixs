import { eq } from "drizzle-orm"
import type { NextRequest } from "next/server"
import { db } from "@/db"
import { documents } from "@/db/schema"
import { requireUser } from "@/lib/auth"
import { readDocumentFile } from "@/lib/storage"

/**
 * Sirve el binario de un documento. Requiere sesión. Por defecto lo devuelve
 * `inline` (para previsualizar PDF/imágenes embebidos); con `?download=1`
 * fuerza la descarga con el nombre original.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await requireUser()
  const { id } = await ctx.params

  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1)
  if (!doc) return new Response("No encontrado", { status: 404 })

  let file: Buffer
  try {
    file = await readDocumentFile(doc.storedName)
  } catch {
    return new Response("Archivo no disponible", { status: 404 })
  }

  const download = req.nextUrl.searchParams.get("download") === "1"
  const disposition = download ? "attachment" : "inline"
  // filename* con UTF-8 para respetar acentos del nombre original.
  const encoded = encodeURIComponent(doc.nombre)

  return new Response(new Uint8Array(file), {
    headers: {
      "content-type": doc.mimeType,
      "content-length": String(doc.tamano),
      "content-disposition": `${disposition}; filename*=UTF-8''${encoded}`,
      "cache-control": "private, no-store",
    },
  })
}
