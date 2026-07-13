import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { users } from "./users"

/**
 * Registro de auditoría (§4.2 del plan): quién tocó qué. Barato y salva vidas.
 * Se escribe desde los service.ts en cada mutación relevante.
 */
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").references(() => users.id),
    accion: text("accion").notNull(), // create | update | delete | login | ...
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    cambios: text("cambios", { mode: "json" }), // diff { campo: [antes, despues] }
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("audit_log_entity_idx").on(t.entityType, t.entityId)],
)

export type AuditEntry = typeof auditLog.$inferSelect
export type NewAuditEntry = typeof auditLog.$inferInsert
