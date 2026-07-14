import { randomUUID } from "node:crypto"
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises"
import path from "node:path"

/**
 * Almacenamiento local de documentos en el filesystem (no en la base). Los
 * archivos viven en `storage/documents/` con un nombre generado (uuid + ext),
 * así el nombre real nunca llega al disco y no hay path traversal posible.
 */
const DOCUMENTS_DIR = path.join(process.cwd(), "storage", "documents")

/** Extensión segura a partir del nombre original (solo alfanumérico, ≤10). */
function safeExtension(originalName: string) {
  const ext = path.extname(originalName).replace(/[^a-zA-Z0-9.]/g, "")
  return ext.length > 1 && ext.length <= 10 ? ext.toLowerCase() : ""
}

/** Guarda el binario y devuelve el nombre con el que quedó en disco. */
export async function saveDocumentFile(buffer: Buffer, originalName: string): Promise<string> {
  await mkdir(DOCUMENTS_DIR, { recursive: true })
  const storedName = `${randomUUID()}${safeExtension(originalName)}`
  await writeFile(path.join(DOCUMENTS_DIR, storedName), buffer)
  return storedName
}

/** Lee el binario de un documento ya guardado. */
export function readDocumentFile(storedName: string): Promise<Buffer> {
  // basename evita cualquier intento de salir de la carpeta.
  return readFile(path.join(DOCUMENTS_DIR, path.basename(storedName)))
}

/** Borra el archivo del disco. Best-effort: si ya no está, no rompe. */
export async function deleteDocumentFile(storedName: string): Promise<void> {
  try {
    await unlink(path.join(DOCUMENTS_DIR, path.basename(storedName)))
  } catch {
    // El archivo pudo haber sido borrado ya; ignoramos.
  }
}
