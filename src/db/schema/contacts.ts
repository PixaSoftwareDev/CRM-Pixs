import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

/**
 * Contacto: la persona/empresa. Persiste para siempre (§3 del plan).
 * `source` = sello de origen (manual | scraping | referido...).
 */
export const contacts = sqliteTable(
  "contacts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    nombre: text("nombre").notNull(),
    empresa: text("empresa"),
    email: text("email"),
    telefono: text("telefono"),
    sitioWeb: text("sitio_web"),
    source: text("source").notNull().default("manual"),
    notas: text("notas"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("contacts_nombre_idx").on(t.nombre)],
)

export type Contact = typeof contacts.$inferSelect
export type NewContact = typeof contacts.$inferInsert
