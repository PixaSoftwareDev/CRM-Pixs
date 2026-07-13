import { and, count, eq, lt, not, sql, sum } from "drizzle-orm"
import { db } from "@/db"
import { contacts, installments, opportunities } from "@/db/schema"

/** Resumen del pipeline por estado (conteo + valor). */
export async function pipelineSummary() {
  return db
    .select({
      estado: opportunities.estado,
      cantidad: count(),
      valor: sum(opportunities.valorEstimado),
    })
    .from(opportunities)
    .groupBy(opportunities.estado)
}

/**
 * Oportunidades frías: sin cambio de estado hace más de `dias`, aún abiertas
 * (transversal §7 — detección de oportunidades frías).
 */
export async function coldOpportunities(dias = 14) {
  // Modo demo (SQLite): cutoff calculado en JS; estadoCambiadoAt es timestamp.
  const cutoff = new Date(Date.now() - dias * 24 * 60 * 60 * 1000)
  return db
    .select({
      id: opportunities.id,
      titulo: opportunities.titulo,
      estado: opportunities.estado,
      estadoCambiadoAt: opportunities.estadoCambiadoAt,
      contactoNombre: contacts.nombre,
    })
    .from(opportunities)
    .innerJoin(contacts, eq(opportunities.contactId, contacts.id))
    .where(
      and(
        lt(opportunities.estadoCambiadoAt, cutoff),
        not(sql`${opportunities.estado} in ('finalizado','perdido')`),
      ),
    )
    .limit(10)
}

/** Cuentas por cobrar: cuotas vencidas o próximas a vencer (§7 Fase 3). */
export async function receivablesSummary() {
  const [row] = await db
    .select({
      pendientes: count(),
      total: sum(installments.monto),
    })
    .from(installments)
    .where(not(eq(installments.estado, "pagada")))
  return row ?? { pendientes: 0, total: null }
}
