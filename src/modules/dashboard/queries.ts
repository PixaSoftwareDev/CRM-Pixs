import { and, asc, count, eq, isNotNull, not, sum } from "drizzle-orm"
import { db } from "@/db"
import { contacts, installments, projects, tasks, transactions, users } from "@/db/schema"

/** Contadores rápidos para las tarjetas KPI del home. */
export async function homeCounts() {
  const [cl] = await db.select({ n: count() }).from(contacts)
  const [pr] = await db.select({ n: count() }).from(projects).where(eq(projects.estado, "activo"))
  const [tk] = await db
    .select({ n: count() })
    .from(tasks)
    .where(not(eq(tasks.estado, "hecho")))
  return {
    clientes: Number(cl?.n ?? 0),
    proyectosActivos: Number(pr?.n ?? 0),
    tareasPendientes: Number(tk?.n ?? 0),
  }
}

/** Tareas con fecha de vencimiento, aún abiertas, más urgentes primero. */
export async function tasksNeedingAttention(limite = 7) {
  return db
    .select({
      id: tasks.id,
      titulo: tasks.titulo,
      estado: tasks.estado,
      color: tasks.color,
      venceAt: tasks.venceAt,
      projectId: tasks.projectId,
      proyectoNombre: projects.nombre,
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(and(not(eq(tasks.estado, "hecho")), isNotNull(tasks.venceAt)))
    .orderBy(asc(tasks.venceAt))
    .limit(limite)
}

/** Reintegros pendientes por persona (gastos pagados de su bolsillo, sin devolver). */
export async function pendingReimbursements() {
  return db
    .select({ nombre: users.nombre, total: sum(transactions.monto) })
    .from(transactions)
    .innerJoin(users, eq(transactions.realizadoPor, users.id))
    .where(and(eq(transactions.tipo, "gasto"), eq(transactions.reintegrado, false)))
    .groupBy(transactions.realizadoPor)
    .orderBy(asc(users.nombre))
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
