import { desc, eq } from "drizzle-orm"
import { db } from "@/db"
import { contacts, opportunities, projects } from "@/db/schema"

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
      personaContacto: contacts.personaContacto,
      // El proyecto que nació de esta oportunidad, si ya se ganó. Sirve para
      // no perder el hilo entre "lo que se vendió" y "lo que se está haciendo".
      projectId: projects.id,
      projectEstado: projects.estado,
    })
    .from(opportunities)
    .innerJoin(contacts, eq(opportunities.contactId, contacts.id))
    .leftJoin(projects, eq(projects.opportunityId, opportunities.id))
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
      personaContacto: contacts.personaContacto,
    })
    .from(opportunities)
    .innerJoin(contacts, eq(opportunities.contactId, contacts.id))
    .where(eq(opportunities.id, id))
    .limit(1)
  return row ?? null
}
