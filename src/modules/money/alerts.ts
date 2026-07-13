import { and, eq, lte, ne, sql } from "drizzle-orm"
import { db } from "@/db"
import { budgets, installments, projects } from "@/db/schema"

/**
 * Marca como "vencida" toda cuota pendiente cuyo vencimiento ya pasó.
 * Idempotente. Pensado para correr a diario (pg_cron → endpoint).
 */
export async function markOverdueInstallments() {
  const res = await db
    .update(installments)
    .set({ estado: "vencida" })
    .where(and(eq(installments.estado, "pendiente"), lte(installments.venceAt, sql`date('now')`)))
    .returning({ id: installments.id })
  return res.length
}

/** Cuotas por cobrar dentro de los próximos `dias` días o ya vencidas. */
export async function upcomingAndOverdue(dias = 7) {
  return db
    .select({
      monto: installments.monto,
      moneda: budgets.moneda,
      venceAt: installments.venceAt,
      estado: installments.estado,
      proyecto: projects.nombre,
    })
    .from(installments)
    .innerJoin(budgets, eq(installments.budgetId, budgets.id))
    .innerJoin(projects, eq(budgets.projectId, projects.id))
    .where(
      and(
        ne(installments.estado, "pagada"),
        lte(installments.venceAt, sql`date('now', ${`+${dias} days`})`),
      ),
    )
    .orderBy(installments.venceAt)
}
