import Database from "better-sqlite3"
import { type BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3"
import * as schema from "./schema"

/**
 * MODO DEMO — cliente Drizzle sobre SQLite (better-sqlite3), inicializado lazy.
 *
 * ⚠️ Esto NO es la configuración real del proyecto (Postgres/Supabase). Es un
 * backend local desechable para poder correr y ver la app sin credenciales.
 * El archivo de la base vive en `demo.sqlite` (raíz del repo, gitignored).
 */
type DB = BetterSQLite3Database<typeof schema>

const DB_PATH = process.env.SQLITE_PATH ?? "demo.sqlite"

let instance: DB | undefined

function getDb(): DB {
  if (!instance) {
    const sqlite = new Database(DB_PATH)
    sqlite.pragma("journal_mode = WAL")
    sqlite.pragma("foreign_keys = ON")
    instance = drizzle(sqlite, { schema })
  }
  return instance
}

// Proxy: reenvía cualquier acceso al cliente real, creándolo on-demand.
export const db = new Proxy({} as DB, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>
    const value = real[prop]
    return typeof value === "function" ? value.bind(real) : value
  },
})

export { schema }
