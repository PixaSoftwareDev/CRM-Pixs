import { asc, desc, eq, like, or } from "drizzle-orm"
import { db } from "@/db"
import { contactPeople, contacts, opportunities, projects } from "@/db/schema"

export type ContactPersonRow = Awaited<ReturnType<typeof listContactPeople>>[number]

/** Personas de contacto de un cliente, más antiguas primero. */
export async function listContactPeople(contactId: string) {
  return db
    .select()
    .from(contactPeople)
    .where(eq(contactPeople.contactId, contactId))
    .orderBy(asc(contactPeople.createdAt))
}

export async function listContacts(search?: string) {
  if (search && search.trim().length > 0) {
    const q = `%${search.trim()}%`
    // SQLite LIKE es case-insensitive para ASCII, así que alcanza para el buscador.
    return db
      .select()
      .from(contacts)
      .where(
        or(like(contacts.nombre, q), like(contacts.personaContacto, q), like(contacts.email, q)),
      )
      .orderBy(desc(contacts.createdAt))
  }
  return db.select().from(contacts).orderBy(desc(contacts.createdAt))
}

export async function getContact(id: string) {
  const [row] = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1)
  return row ?? null
}

export type ContactOpportunity = Awaited<ReturnType<typeof listContactOpportunities>>[number]

/**
 * Oportunidades del contacto con su proyecto asociado (si la oportunidad se
 * ganó). Un contacto puede tener varias: así se ven todos sus negocios y
 * proyectos desde su ficha.
 */
export async function listContactOpportunities(contactId: string) {
  return db
    .select({
      id: opportunities.id,
      titulo: opportunities.titulo,
      estado: opportunities.estado,
      valorEstimado: opportunities.valorEstimado,
      moneda: opportunities.moneda,
      projectId: projects.id,
      projectNombre: projects.nombre,
      projectEstado: projects.estado,
    })
    .from(opportunities)
    .leftJoin(projects, eq(projects.opportunityId, opportunities.id))
    .where(eq(opportunities.contactId, contactId))
    .orderBy(desc(opportunities.createdAt))
}
