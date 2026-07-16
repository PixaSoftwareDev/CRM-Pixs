import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { contacts } from "./contacts"

/**
 * Personas de contacto de un cliente: una empresa puede tener varias (dueño,
 * encargado de pagos, soporte técnico…). Cada una con su nombre, puesto, correo
 * y teléfono. Cuelgan del cliente (`contactId`) y se borran con él.
 */
export const contactPeople = sqliteTable(
  "contact_people",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    nombre: text("nombre").notNull(),
    puesto: text("puesto"),
    email: text("email"),
    telefono: text("telefono"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("contact_people_contact_idx").on(t.contactId)],
)

export type ContactPerson = typeof contactPeople.$inferSelect
export type NewContactPerson = typeof contactPeople.$inferInsert
