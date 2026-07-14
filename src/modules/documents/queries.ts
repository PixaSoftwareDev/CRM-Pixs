import { and, desc, eq } from "drizzle-orm"
import { db } from "@/db"
import { type DocumentEntity, documents, users } from "@/db/schema"

export type DocumentRow = Awaited<ReturnType<typeof listDocuments>>[number]

/** Documentos de una entidad (proyecto o cliente), del más nuevo al más viejo. */
export async function listDocuments(entityType: DocumentEntity, entityId: string) {
  return db
    .select({
      id: documents.id,
      nombre: documents.nombre,
      mimeType: documents.mimeType,
      tamano: documents.tamano,
      createdAt: documents.createdAt,
      subidoPorNombre: users.nombre,
    })
    .from(documents)
    .leftJoin(users, eq(documents.subidoPor, users.id))
    .where(and(eq(documents.entityType, entityType), eq(documents.entityId, entityId)))
    .orderBy(desc(documents.createdAt))
}
