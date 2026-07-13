import { eq } from "drizzle-orm"
import { db } from "@/db"
import { opportunities, projects } from "@/db/schema"
import { addActivity } from "@/modules/activities"

/**
 * Crea el proyecto de una oportunidad recién confirmada, si no existe (§7 Fase 2).
 * Idempotente: no duplica si ya se confirmó antes.
 */
export async function ensureProjectForOpportunity(opportunityId: string, autorId: string) {
  const [existing] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.opportunityId, opportunityId))
    .limit(1)
  if (existing) return existing.id

  const [opp] = await db
    .select({ titulo: opportunities.titulo })
    .from(opportunities)
    .where(eq(opportunities.id, opportunityId))
    .limit(1)
  if (!opp) throw new Error("Oportunidad no encontrada")

  const [project] = await db
    .insert(projects)
    .values({ opportunityId, nombre: opp.titulo })
    .returning({ id: projects.id })

  await addActivity({
    tipo: "cambio_estado",
    entityType: "project",
    entityId: project!.id,
    contenido: "Proyecto creado desde oportunidad confirmada",
    autorId,
  })

  return project!.id
}
