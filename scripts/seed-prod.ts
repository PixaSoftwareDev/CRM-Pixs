/**
 * PRODUCCIÓN — siembra únicamente el usuario admin, sin datos de ejemplo.
 * El login valida el email contra la tabla `users` + la contraseña compartida
 * `DEMO_PASSWORD` (env). Ejecutar una sola vez tras `npm run db:push`.
 *
 * Uso:
 *   SQLITE_PATH=./data/pixs.sqlite \
 *   DEMO_EMAIL=admin@pixs.com \
 *   npx tsx scripts/seed-prod.ts
 */
import Database from "better-sqlite3"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/better-sqlite3"
import * as schema from "../src/db/schema"

const sqlite = new Database(process.env.SQLITE_PATH ?? "demo.sqlite")
sqlite.pragma("foreign_keys = ON")
const db = drizzle(sqlite, { schema })

async function main() {
  const email = process.env.DEMO_EMAIL ?? "admin@pixs.com"
  const nombre = process.env.ADMIN_NOMBRE ?? "Admin"

  const existing = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1)
  if (existing.length > 0) {
    console.log(`El usuario admin ya existe (${email}); no se hace nada.`)
    return
  }

  await db.insert(schema.users).values({ nombre, email, rol: "admin" })
  console.log(`Usuario admin creado: ${email}`)
  console.log("Contraseña: la definida en DEMO_PASSWORD (env). Cambiala antes de exponer la app.")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
