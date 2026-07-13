import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { projects } from "./projects"
import { users } from "./users"

/** Presupuesto por proyecto (§3, decisión §12.2: pagos por proyecto). */
export const budgets = sqliteTable("budgets", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  montoTotal: text("monto_total").notNull(),
  moneda: text("moneda").notNull().default("ARS"),
  descripcion: text("descripcion"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
})

export const INSTALLMENT_STATES = ["pendiente", "pagada", "vencida"] as const
export type InstallmentState = (typeof INSTALLMENT_STATES)[number]

/** Cuotas de un presupuesto. */
export const installments = sqliteTable(
  "installments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    budgetId: text("budget_id")
      .notNull()
      .references(() => budgets.id, { onDelete: "cascade" }),
    monto: text("monto").notNull(),
    venceAt: text("vence_at").notNull(),
    estado: text("estado").notNull().default("pendiente").$type<InstallmentState>(),
    metodoPago: text("metodo_pago"),
    comprobanteUrl: text("comprobante_url"),
    pagadaAt: integer("pagada_at", { mode: "timestamp" }),
  },
  (t) => [index("installments_vence_estado_idx").on(t.venceAt, t.estado)],
)

export const TRANSACTION_TYPES = ["ingreso", "gasto"] as const
export type TransactionType = (typeof TRANSACTION_TYPES)[number]

/** Ingresos y gastos de la empresa, con atribución ("quién hizo el gasto"). */
export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tipo: text("tipo").notNull().$type<TransactionType>(),
    monto: text("monto").notNull(),
    moneda: text("moneda").notNull().default("ARS"),
    categoria: text("categoria"),
    realizadoPor: text("realizado_por").references(() => users.id),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    fecha: text("fecha").notNull(),
    comprobanteUrl: text("comprobante_url"),
    descripcion: text("descripcion"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("transactions_fecha_idx").on(t.fecha)],
)

export type Budget = typeof budgets.$inferSelect
export type Installment = typeof installments.$inferSelect
export type Transaction = typeof transactions.$inferSelect
