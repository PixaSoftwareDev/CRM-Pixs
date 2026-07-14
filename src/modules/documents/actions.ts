"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/db"
import { DOCUMENT_ENTITIES, type DocumentEntity, documents } from "@/db/schema"
import { audit, requireUser } from "@/lib/auth"
import { deleteDocumentFile, saveDocumentFile } from "@/lib/storage"
import { ALLOWED_DOCUMENT_TYPES, MAX_DOCUMENT_SIZE } from "./shared"

export type DocumentActionState = { ok?: boolean; error?: string }

/** Ruta a revalidar según la entidad dueña del documento. */
function entityPath(entityType: DocumentEntity, entityId: string) {
  return entityType === "project" ? `/proyectos/${entityId}` : `/contactos/${entityId}`
}

const uploadSchema = z.object({
  entityType: z.enum(DOCUMENT_ENTITIES),
  entityId: z.string().uuid(),
})

/** Sube un documento y lo cuelga de un proyecto o cliente. */
export async function uploadDocument(
  _prev: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  const user = await requireUser()

  const parsed = uploadSchema.safeParse({
    entityType: formData.get("entityType"),
    entityId: formData.get("entityId"),
  })
  if (!parsed.success) return { error: "Entidad inválida" }

  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) return { error: "Elegí un archivo" }
  if (file.size > MAX_DOCUMENT_SIZE) return { error: "El archivo supera los 20 MB" }
  if (!ALLOWED_DOCUMENT_TYPES[file.type]) {
    return { error: "Tipo de archivo no permitido (PDF, imágenes, Office, texto o ZIP)" }
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const storedName = await saveDocumentFile(buffer, file.name)

  const [row] = await db
    .insert(documents)
    .values({
      entityType: parsed.data.entityType,
      entityId: parsed.data.entityId,
      nombre: file.name,
      storedName,
      mimeType: file.type,
      tamano: file.size,
      subidoPor: user.id,
    })
    .returning({ id: documents.id })

  await audit({
    userId: user.id,
    accion: "create",
    entityType: "document",
    entityId: row?.id,
  })
  revalidatePath(entityPath(parsed.data.entityType, parsed.data.entityId))
  return { ok: true }
}

/** Elimina un documento (archivo del disco + fila). */
export async function deleteDocument(id: string): Promise<DocumentActionState> {
  const user = await requireUser()

  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1)
  if (!doc) return { error: "El documento ya no existe" }

  await db.delete(documents).where(eq(documents.id, id))
  await deleteDocumentFile(doc.storedName)

  await audit({ userId: user.id, accion: "delete", entityType: "document", entityId: id })
  revalidatePath(entityPath(doc.entityType, doc.entityId))
  return { ok: true }
}
