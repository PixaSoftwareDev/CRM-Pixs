/**
 * PRODUCCIÓN — siembra el equipo (Alejo admin + Enzo + Guillermo), sin datos de
 * ejemplo. El login valida el email contra la tabla `users` + la contraseña
 * compartida `DEMO_PASSWORD` (env). Es idempotente: inserta el que falte y
 * corrige nombre/rol del que ya exista. Se puede correr varias veces sin riesgo.
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

// El admin (con quien se loguea) usa DEMO_EMAIL; el resto son miembros del equipo.
const ADMIN_EMAIL = process.env.DEMO_EMAIL ?? "admin@pixs.com"
const ADMIN_NOMBRE = process.env.ADMIN_NOMBRE ?? "Alejo"

const TEAM = [
  { nombre: ADMIN_NOMBRE, email: ADMIN_EMAIL, rol: "admin" as const },
  { nombre: "Enzo", email: "enzo@pixs.com", rol: "miembro" as const },
  { nombre: "Guillermo", email: "guillermo@pixs.com", rol: "miembro" as const },
]

async function main() {
  for (const u of TEAM) {
    const [existing] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, u.email))
      .limit(1)

    if (existing) {
      await db
        .update(schema.users)
        .set({ nombre: u.nombre, rol: u.rol })
        .where(eq(schema.users.id, existing.id))
      console.log(`Actualizado: ${u.nombre} <${u.email}> (${u.rol})`)
    } else {
      await db.insert(schema.users).values(u)
      console.log(`Creado: ${u.nombre} <${u.email}> (${u.rol})`)
    }
  }
  console.log("Contraseña de acceso: la definida en DEMO_PASSWORD (env), compartida por el equipo.")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
