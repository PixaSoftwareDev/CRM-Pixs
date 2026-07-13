import { eq } from "drizzle-orm"
import { db } from "@/db"
import { type OpportunityState, opportunities } from "@/db/schema"
import { addActivity } from "@/modules/activities"

/**
 * Cambia el estado de una oportunidad (drag entre columnas del pipeline).
 * Registra el cambio en el timeline y actualiza estado_cambiado_at para medir
 * tiempo por etapa. Al pasar a "confirmado" se dispara la creación del proyecto
 * (se engancha en la Fase 2 mediante onConfirmed).
 */
export async function moveOpportunity(input: {
  id: string
  estado: OpportunityState
  motivoPerdida?: string
  autorId: string
  onConfirmed?: (opportunityId: string) => Promise<unknown>
}) {
  const [prev] = await db
    .select({ estado: opportunities.estado, titulo: opportunities.titulo })
    .from(opportunities)
    .where(eq(opportunities.id, input.id))
    .limit(1)

  if (!prev) throw new Error("Oportunidad no encontrada")
  if (prev.estado === input.estado) return

  await db
    .update(opportunities)
    .set({
      estado: input.estado,
      motivoPerdida: input.estado === "perdido" ? (input.motivoPerdida ?? null) : null,
      estadoCambiadoAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(opportunities.id, input.id))

  await addActivity({
    tipo: "cambio_estado",
    entityType: "opportunity",
    entityId: input.id,
    contenido: `Estado: ${prev.estado} → ${input.estado}${
      input.motivoPerdida ? ` (${input.motivoPerdida})` : ""
    }`,
    autorId: input.autorId,
  })

  if (input.estado === "confirmado" && input.onConfirmed) {
    await input.onConfirmed(input.id)
  }
}
