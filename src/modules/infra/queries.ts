import { desc, eq, like, or } from "drizzle-orm"
import { db } from "@/db"
import { databases, servers } from "@/db/schema"

/**
 * Búsqueda sobre servers. En modo demo (SQLite) no hay full-text/GIN: cae a
 * LIKE sobre los campos de texto relevantes.
 */
export async function searchServers(q?: string) {
  if (q && q.trim()) {
    const term = `%${q.trim()}%`
    return db
      .select()
      .from(servers)
      .where(
        or(
          like(servers.nombre, term),
          like(servers.proveedor, term),
          like(servers.ipHostname, term),
          like(servers.descripcion, term),
          like(servers.os, term),
        ),
      )
      .orderBy(desc(servers.createdAt))
  }
  return db.select().from(servers).orderBy(desc(servers.createdAt))
}

export async function searchDatabases(q?: string) {
  if (q && q.trim()) {
    const term = `%${q.trim()}%`
    return db
      .select()
      .from(databases)
      .where(
        or(
          like(databases.nombre, term),
          like(databases.motor, term),
          like(databases.host, term),
          like(databases.descripcion, term),
        ),
      )
      .orderBy(desc(databases.createdAt))
  }
  return db.select().from(databases).orderBy(desc(databases.createdAt))
}

export async function listServersMinimal() {
  return db.select({ id: servers.id, nombre: servers.nombre }).from(servers)
}

export async function getServer(id: string) {
  const [row] = await db.select().from(servers).where(eq(servers.id, id)).limit(1)
  return row ?? null
}
