import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { contacts } from "./contacts"
import { opportunities } from "./opportunities"

/**
 * Proyecto: se crea al pasar la oportunidad a "confirmado" (§3/§7).
 * Relación 1—1 con la oportunidad de origen.
 */
export const PROJECT_STATES = ["activo", "pausado", "finalizado", "cancelado"] as const
export type ProjectState = (typeof PROJECT_STATES)[number]

export const projects = sqliteTable(
  "projects",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // Opcional: un proyecto puede crearse directo desde Proyectos, sin pasar por
    // el embudo de ventas. Si nació de una oportunidad ganada, queda el vínculo.
    opportunityId: text("opportunity_id").references(() => opportunities.id, {
      onDelete: "cascade",
    }),
    // Cliente dueño del proyecto. Antes se deducía a través de la oportunidad;
    // ahora es directo, para poder crear proyectos sin oportunidad.
    contactId: text("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
    nombre: text("nombre").notNull(),
    estado: text("estado").notNull().default("activo").$type<ProjectState>(),
    fechaInicio: text("fecha_inicio"),
    fechaFinEstimada: text("fecha_fin_estimada"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("projects_opportunity_idx").on(t.opportunityId),
    index("projects_contact_idx").on(t.contactId),
  ],
)

export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert
