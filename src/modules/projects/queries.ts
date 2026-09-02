import { desc, eq, sql, sum } from "drizzle-orm"
import { db } from "@/db"
import { budgets, contacts, projects, projectTechInfo } from "@/db/schema"

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
      // El valor del proyecto es lo presupuestado (suma de sus presupuestos).
      valor: sum(budgets.montoTotal),
      moneda: sql<string | null>`max(${budgets.moneda})`,
    })
    .from(projects)
    .leftJoin(contacts, eq(projects.contactId, contacts.id))
    .leftJoin(budgets, eq(budgets.projectId, projects.id))
    .groupBy(projects.id)
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
      contactoNombre: contacts.nombre,
      contactId: projects.contactId,
    })
    .from(projects)
    .leftJoin(contacts, eq(projects.contactId, contacts.id))
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
