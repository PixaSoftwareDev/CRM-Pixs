/** Reglas y helpers de documentos compartidos entre cliente y servidor. */

/** Peso máximo por archivo: 20 MB (cubre contratos e imágenes con margen). */
export const MAX_DOCUMENT_SIZE = 20 * 1024 * 1024

/**
 * Tipos MIME permitidos → categoría (para ícono y previsualización).
 * PDF e imágenes se ven embebidos; el resto se descarga.
 */
export const ALLOWED_DOCUMENT_TYPES: Record<string, DocumentKind> = {
  "application/pdf": "pdf",
  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
  "image/gif": "image",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "doc",
  "application/vnd.ms-excel": "sheet",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "sheet",
  "text/csv": "sheet",
  "text/plain": "doc",
  "application/zip": "other",
}

export type DocumentKind = "pdf" | "image" | "doc" | "sheet" | "other"

/** ¿El archivo se puede previsualizar embebido en la plataforma? */
export function isPreviewable(mimeType: string) {
  return mimeType === "application/pdf" || mimeType.startsWith("image/")
}

/** Categoría del documento para elegir ícono (fallback "other"). */
export function documentKind(mimeType: string): DocumentKind {
  return ALLOWED_DOCUMENT_TYPES[mimeType] ?? "other"
}

/** Tamaño legible: 12.4 KB, 3.1 MB, etc. */
export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`
  const mb = kb / 1024
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`
}
