import { desc, eq } from "drizzle-orm"
import { db } from "@/db"
import { contacts, opportunities, projects, projectTechInfo } from "@/db/schema"

export type ProjectListRow = Awaited<ReturnType<typeof listProjects>>[number]

export async function listProjects() {
  return db
    .select({
      id: projects.id,
      nombre: projects.nombre,
      estado: projects.estado,
      fechaInicio: projects.fechaInicio,
      createdAt: projects.createdAt,
      contactId: projects.contactId,
      contactoNombre: contacts.nombre,
      valor: opportunities.valorEstimado,
      moneda: opportunities.moneda,
    })
    .from(projects)
    .leftJoin(contacts, eq(projects.contactId, contacts.id))
    .leftJoin(opportunities, eq(projects.opportunityId, opportunities.id))
    .orderBy(desc(projects.createdAt))
}

export async function getProject(id: string) {
  const [row] = await db
    .select({
      id: projects.id,
      nombre: projects.nombre,
      estado: projects.estado,
      fechaInicio: projects.fechaInicio,
      fechaFinEstimada: projects.fechaFinEstimada,
      opportunityId: projects.opportunityId,
      contactoNombre: contacts.nombre,
      contactId: projects.contactId,
    })
    .from(projects)
    .leftJoin(contacts, eq(projects.contactId, contacts.id))
    .leftJoin(opportunities, eq(projects.opportunityId, opportunities.id))
    .where(eq(projects.id, id))
    .limit(1)
  return row ?? null
}

export async function getTechInfo(projectId: string) {
  return db
    .select()
    .from(projectTechInfo)
    .where(eq(projectTechInfo.projectId, projectId))
    .orderBy(desc(projectTechInfo.createdAt))
}
