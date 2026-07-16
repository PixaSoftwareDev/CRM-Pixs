import { and, desc, eq, gte, lte, not, sql } from "drizzle-orm"
import { db } from "@/db"
import {
  budgets,
  contacts,
  documents,
  installments,
  opportunities,
  projects,
  transactions,
  users,
} from "@/db/schema"

export async function getProjectBudget(projectId: string) {
  const [budget] = await db
    .select()
    .from(budgets)
    .where(eq(budgets.projectId, projectId))
    .orderBy(desc(budgets.createdAt))
    .limit(1)
  if (!budget) return null

  const cuotas = await db
    .select()
    .from(installments)
    .where(eq(installments.budgetId, budget.id))
    .orderBy(installments.venceAt)

  return { budget, cuotas }
}

/** Cuentas por cobrar: cuotas no pagadas, con proyecto y empresa (cliente). */
export async function receivables() {
  return db
    .select({
      id: installments.id,
      monto: installments.monto,
      moneda: budgets.moneda,
      venceAt: installments.venceAt,
      estado: installments.estado,
      proyecto: projects.nombre,
      projectId: projects.id,
      empresa: contacts.nombre,
      contactId: contacts.id,
    })
    .from(installments)
    .innerJoin(budgets, eq(installments.budgetId, budgets.id))
    .innerJoin(projects, eq(budgets.projectId, projects.id))
    .innerJoin(opportunities, eq(projects.opportunityId, opportunities.id))
    .innerJoin(contacts, eq(opportunities.contactId, contacts.id))
    .where(not(eq(installments.estado, "pagada")))
    .orderBy(installments.venceAt)
}

export type TransactionRow = Awaited<ReturnType<typeof listTransactions>>[number]

export async function listTransactions(opts?: { from?: string; to?: string }) {
  const conds = []
  if (opts?.from) conds.push(gte(transactions.fecha, opts.from))
  if (opts?.to) conds.push(lte(transactions.fecha, opts.to))
  return db
    .select({
      id: transactions.id,
      tipo: transactions.tipo,
      monto: transactions.monto,
      moneda: transactions.moneda,
      categoria: transactions.categoria,
      fecha: transactions.fecha,
      descripcion: transactions.descripcion,
      autor: users.nombre,
      realizadoPor: transactions.realizadoPor,
      reintegrado: transactions.reintegrado,
      projectId: transactions.projectId,
      // Comprobante adjunto (opcional): id del documento + su tipo, para linkear.
      comprobanteId: documents.id,
      comprobanteNombre: documents.nombre,
      comprobanteMime: documents.mimeType,
    })
    .from(transactions)
    .leftJoin(users, eq(transactions.realizadoPor, users.id))
    .leftJoin(documents, eq(documents.id, transactions.comprobanteUrl))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(transactions.fecha))
}

/** Rentabilidad: ingresos - gastos, global. */
export async function financeSummary() {
  const [row] = await db
    .select({
      ingresos: sql<string>`coalesce(sum(case when ${transactions.tipo} = 'ingreso' then ${transactions.monto} else 0 end), 0)`,
      gastos: sql<string>`coalesce(sum(case when ${transactions.tipo} = 'gasto' then ${transactions.monto} else 0 end), 0)`,
    })
    .from(transactions)
  return {
    ingresos: Number(row?.ingresos ?? 0),
    gastos: Number(row?.gastos ?? 0),
    neto: Number(row?.ingresos ?? 0) - Number(row?.gastos ?? 0),
  }
}
