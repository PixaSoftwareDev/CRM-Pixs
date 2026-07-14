import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { users } from "./users"

/**
 * Documentos adjuntos (contratos, propuestas, entregables). Polimórfico como
 * la línea de tiempo: cuelga de un proyecto o de un cliente vía entityType +
 * entityId (sin FK dura). El binario vive en el filesystem (`storage/documents`),
 * acá solo va la metadata. Ver src/lib/storage.ts.
 */
export const DOCUMENT_ENTITIES = ["project", "contact"] as const
export type DocumentEntity = (typeof DOCUMENT_ENTITIES)[number]

export const documents = sqliteTable(
  "documents",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    entityType: text("entity_type").notNull().$type<DocumentEntity>(),
    entityId: text("entity_id").notNull(),
    // Nombre visible (el original del archivo).
    nombre: text("nombre").notNull(),
    // Nombre en disco (uuid + extensión); nunca se expone al usuario.
    storedName: text("stored_name").notNull(),
    mimeType: text("mime_type").notNull(),
    tamano: integer("tamano").notNull(), // bytes
    subidoPor: text("subido_por").references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("documents_entity_idx").on(t.entityType, t.entityId)],
)

export type Document = typeof documents.$inferSelect
export type NewDocument = typeof documents.$inferInsert
