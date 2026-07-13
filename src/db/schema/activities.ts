import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { users } from "./users"

/**
 * Línea de tiempo polimórfica (§3): nota/archivo/captura que cuelga de lo que sea
 * (contacto, oportunidad, proyecto, tarea). No hay FK dura por ser polimórfica;
 * la integridad se cuida en el service.
 */
export const ACTIVITY_TYPES = ["nota", "archivo", "cambio_estado", "comentario"] as const
export type ActivityType = (typeof ACTIVITY_TYPES)[number]

export const ACTIVITY_ENTITIES = ["contact", "opportunity", "project", "task"] as const
export type ActivityEntity = (typeof ACTIVITY_ENTITIES)[number]

export const activities = sqliteTable(
  "activities",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tipo: text("tipo").notNull().$type<ActivityType>(),
    entityType: text("entity_type").notNull().$type<ActivityEntity>(),
    entityId: text("entity_id").notNull(),
    contenido: text("contenido"),
    archivoUrl: text("archivo_url"),
    autorId: text("autor_id").references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("activities_entity_idx").on(t.entityType, t.entityId)],
)

export type Activity = typeof activities.$inferSelect
export type NewActivity = typeof activities.$inferInsert
