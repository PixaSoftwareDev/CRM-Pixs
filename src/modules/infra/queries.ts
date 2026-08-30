import { asc, desc, eq } from "drizzle-orm"
import { db } from "@/db"
import { databases, monitoredApps, servers } from "@/db/schema"

export type ServerRow = typeof servers.$inferSelect
export type DatabaseRow = typeof databases.$inferSelect

/**
 * Todos los servidores. El filtrado (texto, estado, proveedor) se hace en el
 * cliente para que sea en vivo; en modo demo (SQLite) no hay full-text/GIN.
 */
export async function listServers() {
  return db.select().from(servers).orderBy(desc(servers.createdAt))
}

/** Todas las bases; el filtrado (texto, entorno, motor) va en el cliente. */
export async function listDatabases() {
  return db.select().from(databases).orderBy(desc(databases.createdAt))
}

export async function getServer(id: string) {
  const [row] = await db.select().from(servers).where(eq(servers.id, id)).limit(1)
  return row ?? null
}

export type MonitoredAppRow = Awaited<ReturnType<typeof listApps>>[number]

/** Aplicaciones publicadas, para el listado de Monitoreo. */
export async function listApps() {
  return db.select().from(monitoredApps).orderBy(asc(monitoredApps.nombre))
}
