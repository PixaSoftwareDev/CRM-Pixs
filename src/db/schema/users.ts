import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

/**
 * Perfil de usuario. El id es un UUID propio y la auth es local por cookie
 * (ver `src/lib/auth/session.ts`). Mantiene nombre/rol/avatar y atribución (§3).
 */
export const users = sqliteTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  nombre: text("nombre").notNull(),
  email: text("email").notNull().unique(),
  rol: text("rol").notNull().default("miembro"),
  avatarUrl: text("avatar_url"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
