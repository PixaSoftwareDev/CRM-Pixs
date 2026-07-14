import { and, desc, eq, like, or } from "drizzle-orm"
import { db } from "@/db"
import { type CredentialType, credentials, projects } from "@/db/schema"

export type CredentialRow = Awaited<ReturnType<typeof listCredentials>>[number]

type Filters = { q?: string; projectId?: string; tipo?: string }

/**
 * Lista de accesos con filtros opcionales (texto, proyecto, tipo). NUNCA
 * devuelve el secreto: solo un flag `tieneSecreto`. El secreto se pide aparte
 * con la acción `revealSecret`.
 */
export async function listCredentials(filters: Filters = {}) {
  const conds = []
  if (filters.projectId) conds.push(eq(credentials.projectId, filters.projectId))
  if (filters.tipo) conds.push(eq(credentials.tipo, filters.tipo as CredentialType))
  if (filters.q) {
    const term = `%${filters.q}%`
    conds.push(
      or(
        like(credentials.titulo, term),
        like(credentials.usuario, term),
        like(credentials.url, term),
        like(credentials.notas, term),
      ),
    )
  }

  return db
    .select({
      id: credentials.id,
      titulo: credentials.titulo,
      tipo: credentials.tipo,
      usuario: credentials.usuario,
      url: credentials.url,
      notas: credentials.notas,
      projectId: credentials.projectId,
      proyectoNombre: projects.nombre,
      // Flag: hay secreto guardado, pero no lo exponemos.
      tieneSecreto: credentials.secretoCifrado,
      createdAt: credentials.createdAt,
      updatedAt: credentials.updatedAt,
    })
    .from(credentials)
    .leftJoin(projects, eq(credentials.projectId, projects.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(credentials.updatedAt))
}

export type ProjectOption = { id: string; nombre: string }

/** Proyectos (id + nombre) para el selector/filtro de accesos. */
export async function listProjectOptions(): Promise<ProjectOption[]> {
  return db
    .select({ id: projects.id, nombre: projects.nombre })
    .from(projects)
    .orderBy(projects.nombre)
}
