import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
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
    opportunityId: text("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    nombre: text("nombre").notNull(),
    estado: text("estado").notNull().default("activo").$type<ProjectState>(),
    fechaInicio: text("fecha_inicio"),
    fechaFinEstimada: text("fecha_fin_estimada"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("projects_opportunity_idx").on(t.opportunityId)],
)

export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert
