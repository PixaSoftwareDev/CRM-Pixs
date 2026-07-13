import { desc, eq } from "drizzle-orm"
import { db } from "@/db"
import { contacts, opportunities } from "@/db/schema"

export type OpportunityWithContact = Awaited<ReturnType<typeof listOpportunities>>[number]

export async function listOpportunities() {
  return db
    .select({
      id: opportunities.id,
      titulo: opportunities.titulo,
      estado: opportunities.estado,
      valorEstimado: opportunities.valorEstimado,
      moneda: opportunities.moneda,
      probabilidad: opportunities.probabilidad,
      motivoPerdida: opportunities.motivoPerdida,
      estadoCambiadoAt: opportunities.estadoCambiadoAt,
      contactId: opportunities.contactId,
      contactoNombre: contacts.nombre,
      empresa: contacts.empresa,
    })
    .from(opportunities)
    .innerJoin(contacts, eq(opportunities.contactId, contacts.id))
    .orderBy(desc(opportunities.createdAt))
}

export async function getOpportunity(id: string) {
  const [row] = await db
    .select({
      id: opportunities.id,
      titulo: opportunities.titulo,
      estado: opportunities.estado,
      valorEstimado: opportunities.valorEstimado,
      moneda: opportunities.moneda,
      probabilidad: opportunities.probabilidad,
      motivoPerdida: opportunities.motivoPerdida,
      createdAt: opportunities.createdAt,
      estadoCambiadoAt: opportunities.estadoCambiadoAt,
      contactId: opportunities.contactId,
      contactoNombre: contacts.nombre,
      empresa: contacts.empresa,
    })
    .from(opportunities)
    .innerJoin(contacts, eq(opportunities.contactId, contacts.id))
    .where(eq(opportunities.id, id))
    .limit(1)
  return row ?? null
}
