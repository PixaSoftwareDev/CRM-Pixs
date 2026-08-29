import { and, asc, desc, eq, like, ne, or, sql } from "drizzle-orm"
import { db } from "@/db"
import {
  budgets,
  contactPeople,
  contacts,
  installments,
  opportunities,
  projects,
  transactions,
} from "@/db/schema"

export type ContactPersonRow = Awaited<ReturnType<typeof listContactPeople>>[number]

/** Personas de contacto de un cliente, más antiguas primero. */
export async function listContactPeople(contactId: string) {
  return db
    .select()
    .from(contactPeople)
    .where(eq(contactPeople.contactId, contactId))
    .orderBy(asc(contactPeople.createdAt))
}

/** Columnas por las que se puede ordenar el listado (las de la tabla). */
export const CONTACT_SORTS = {
  nombre: contacts.nombre,
  personaContacto: contacts.personaContacto,
  email: contacts.email,
  telefono: contacts.telefono,
  source: contacts.source,
  createdAt: contacts.createdAt,
} as const

export type ContactSort = keyof typeof CONTACT_SORTS
export type SortDir = "asc" | "desc"

/** `true` si el valor viene de la URL y es una columna válida. */
export function isContactSort(v: unknown): v is ContactSort {
  return typeof v === "string" && v in CONTACT_SORTS
}

export async function listContacts(
  search?: string,
  sort: ContactSort = "createdAt",
  dir: SortDir = "desc",
) {
  const columna = CONTACT_SORTS[sort] ?? CONTACT_SORTS.createdAt
  const orden = dir === "asc" ? asc(columna) : desc(columna)

  if (search && search.trim().length > 0) {
    const q = `%${search.trim()}%`
    // SQLite LIKE es case-insensitive para ASCII, así que alcanza para el buscador.
    return db
      .select()
      .from(contacts)
      .where(
        or(like(contacts.nombre, q), like(contacts.personaContacto, q), like(contacts.email, q)),
      )
      .orderBy(orden)
  }
  return db.select().from(contacts).orderBy(orden)
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

export type ContactPayment = Awaited<ReturnType<typeof listContactPayments>>[number]

/**
 * Todo el dinero del cliente: los cobros cargados directo en su ficha y también
 * los de sus proyectos. Si solo se miraran los directos, el total mentiría.
 * `comprobanteUrl` es el id del documento adjunto (/api/documentos/[id]).
 */
export async function listContactPayments(contactId: string) {
  return db
    .select({
      id: transactions.id,
      tipo: transactions.tipo,
      monto: transactions.monto,
      moneda: transactions.moneda,
      fecha: transactions.fecha,
      descripcion: transactions.descripcion,
      comprobanteUrl: transactions.comprobanteUrl,
      // De qué proyecto vino, si no se cargó directo sobre el cliente.
      projectId: transactions.projectId,
      projectNombre: projects.nombre,
    })
    .from(transactions)
    .leftJoin(projects, eq(projects.id, transactions.projectId))
    .where(or(eq(transactions.contactId, contactId), eq(projects.contactId, contactId)))
    .orderBy(desc(transactions.fecha))
}

/** Suma de las cuotas que el cliente todavía no pagó, en todos sus proyectos. */
export async function getContactPending(contactId: string) {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(cast(${installments.monto} as real)), 0)` })
    .from(installments)
    .innerJoin(budgets, eq(budgets.id, installments.budgetId))
    .innerJoin(projects, eq(projects.id, budgets.projectId))
    .where(and(eq(projects.contactId, contactId), ne(installments.estado, "pagada")))
  return row?.total ?? 0
}

export type ContactProject = Awaited<ReturnType<typeof listContactProjects>>[number]

/** Proyectos del cliente, directo por `contactId` (ya no vía la oportunidad). */
export async function listContactProjects(contactId: string) {
  return db
    .select({
      id: projects.id,
      nombre: projects.nombre,
      estado: projects.estado,
      fechaInicio: projects.fechaInicio,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .where(eq(projects.contactId, contactId))
    .orderBy(desc(projects.createdAt))
}
