/**
 * Dinero. Cuatro piezas:
 *  1. documents + document_allocations → cuenta corriente del cliente.
 *     Debe = factura / nota de débito. Haber = recibo / nota de crédito.
 *     Un recibo se imputa a una o más facturas; lo pendiente de una factura es
 *     su importe menos lo imputado. Saldo = Σ debe − Σ haber.
 *  2. installment_plans + installments → cuotas de un proyecto (pantalla "Cobranzas").
 *  3. subscriptions + price_adjustments → abonos mensuales y aumentos masivos (IPC).
 *  4. cash_movements → caja de la empresa (ingresos/egresos, gastos a devolver).
 * Importes siempre positivos en centavos; el signo lo da el tipo.
 */
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createdAt, id, money, ref, timestamps, tstz } from "./_shared/columns";
import { clients, invoiceLetter } from "./clients";
import { users } from "./identity";
import { projects } from "./projects";

export const documentKind = pgEnum("document_kind", [
  "factura",
  "nota_debito",
  "nota_credito",
  "recibo",
]);
export const documentStatus = pgEnum("document_status", ["borrador", "emitido", "anulado"]);
export const paymentMethod = pgEnum("payment_method", [
  "transferencia",
  "efectivo",
  "tarjeta",
  "mercado_pago",
  "cheque",
  "otro",
]);
export const cashDirection = pgEnum("cash_direction", ["ingreso", "egreso"]);

// ─── 1. Cuenta corriente ────────────────────────────────────────────────────

export const documents = pgTable(
  "documents",
  {
    id: id(),
    clientId: ref()
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    projectId: ref().references(() => projects.id, { onDelete: "set null" }),
    kind: documentKind().notNull(),
    /** Letra fiscal; null en recibos. */
    letter: invoiceLetter(),
    pointOfSale: smallint().notNull(),
    number: integer().notNull(),
    issuedOn: date({ mode: "string" }).notNull(),
    dueOn: date({ mode: "string" }),
    concept: text().notNull(),
    amount: money().notNull(),
    status: documentStatus().notNull().default("emitido"),
    /** Solo recibos. */
    paymentMethod: paymentMethod(),
    /** Factura generada por el devengamiento de un abono: abono + mes (día 1). */
    subscriptionId: ref().references((): AnyPgColumn => subscriptions.id, { onDelete: "set null" }),
    period: date({ mode: "string" }),
    createdById: ref().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    check("documents_amount_ck", sql`${t.amount} > 0`),
    check(
      "documents_receipt_ck",
      sql`(${t.kind} = 'recibo') = (${t.paymentMethod} IS NOT NULL)`,
    ),
    // NULLS NOT DISTINCT: dos recibos (letra null) con el mismo número también chocan.
    unique("documents_number_uq").on(t.kind, t.letter, t.pointOfSale, t.number).nullsNotDistinct(),
    // Estado de cuenta: movimientos de un cliente por fecha.
    index("documents_client_issued_idx").on(t.clientId, t.issuedOn),
    // Vencimientos (facturas emitidas con fecha de vencimiento).
    index("documents_due_idx")
      .on(t.dueOn)
      .where(sql`${t.kind} IN ('factura', 'nota_debito') AND ${t.status} = 'emitido'`),
    index("documents_project_idx").on(t.projectId),
    // Devengar dos veces el mismo mes no duplica facturas.
    uniqueIndex("documents_subscription_period_uq")
      .on(t.subscriptionId, t.period)
      .where(sql`${t.subscriptionId} IS NOT NULL`),
  ],
);

/** Imputación de un recibo / nota de crédito (source) a una factura / nota de débito (target). */
export const documentAllocations = pgTable(
  "document_allocations",
  {
    sourceId: ref()
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    targetId: ref()
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    amount: money().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.sourceId, t.targetId] }),
    check("document_allocations_amount_ck", sql`${t.amount} > 0`),
    check("document_allocations_self_ck", sql`${t.sourceId} <> ${t.targetId}`),
    index("document_allocations_target_idx").on(t.targetId),
  ],
);

// ─── 2. Cuotas ──────────────────────────────────────────────────────────────

export const installmentPlans = pgTable(
  "installment_plans",
  {
    id: id(),
    clientId: ref()
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    projectId: ref().references(() => projects.id, { onDelete: "set null" }),
    /** "50% anticipo + 2 cuotas". */
    description: text().notNull(),
    total: money().notNull(),
    ...timestamps,
  },
  (t) => [
    check("installment_plans_total_ck", sql`${t.total} > 0`),
    index("installment_plans_client_idx").on(t.clientId),
    index("installment_plans_project_idx").on(t.projectId),
  ],
);

export const installments = pgTable(
  "installments",
  {
    id: id(),
    planId: ref()
      .notNull()
      .references(() => installmentPlans.id, { onDelete: "cascade" }),
    /** 1-based; 0 = anticipo. */
    number: smallint().notNull(),
    amount: money().notNull(),
    dueOn: date({ mode: "string" }).notNull(),
    /** Factura emitida por esta cuota (cuando se factura). */
    invoiceId: ref().references(() => documents.id, { onDelete: "set null" }),
    autoReminder: boolean().notNull().default(true),
    lastReminderAt: tstz(),
    ...timestamps,
  },
  (t) => [
    check("installments_amount_ck", sql`${t.amount} > 0`),
    uniqueIndex("installments_plan_number_uq").on(t.planId, t.number),
    index("installments_due_idx").on(t.dueOn),
    index("installments_invoice_idx").on(t.invoiceId),
  ],
);

// ─── 3. Abonos ──────────────────────────────────────────────────────────────

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: id(),
    clientId: ref()
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    /** "Mantenimiento web". */
    name: text().notNull(),
    amount: money().notNull(),
    billingDay: smallint().notNull().default(1),
    startsOn: date({ mode: "string" }).notNull(),
    endsOn: date({ mode: "string" }),
    active: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [
    check("subscriptions_amount_ck", sql`${t.amount} > 0`),
    check("subscriptions_billing_day_ck", sql`${t.billingDay} BETWEEN 1 AND 28`),
    index("subscriptions_client_idx").on(t.clientId),
    index("subscriptions_active_day_idx").on(t.billingDay).where(sql`${t.active}`),
  ],
);

/** Aumento aplicado en lote (p. ej. IPC 3,5 % a 3 abonos). */
export const priceAdjustments = pgTable("price_adjustments", {
  id: id(),
  effectiveOn: date({ mode: "string" }).notNull(),
  percent: numeric({ precision: 6, scale: 2 }).notNull(),
  note: text(),
  appliedById: ref().references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const priceAdjustmentItems = pgTable(
  "price_adjustment_items",
  {
    adjustmentId: ref()
      .notNull()
      .references(() => priceAdjustments.id, { onDelete: "cascade" }),
    subscriptionId: ref()
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    previousAmount: money().notNull(),
    newAmount: money().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.adjustmentId, t.subscriptionId] }),
    index("price_adjustment_items_sub_idx").on(t.subscriptionId),
  ],
);

// ─── 4. Caja ────────────────────────────────────────────────────────────────

export const cashMovements = pgTable(
  "cash_movements",
  {
    id: id(),
    occurredOn: date({ mode: "string" }).notNull(),
    direction: cashDirection().notNull(),
    amount: money().notNull(),
    concept: text().notNull(),
    category: text(),
    clientId: ref().references(() => clients.id, { onDelete: "set null" }),
    /** Recibo que originó el ingreso. */
    documentId: ref().references(() => documents.id, { onDelete: "set null" }),
    /** Quién puso la plata (gasto pagado por un socio). */
    paidById: ref().references(() => users.id, { onDelete: "set null" }),
    /** "A devolver": gasto adelantado por un integrante. */
    reimbursable: boolean().notNull().default(false),
    reimbursedAt: tstz(),
    createdById: ref().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    check("cash_movements_amount_ck", sql`${t.amount} > 0`),
    index("cash_movements_occurred_idx").on(t.occurredOn),
    index("cash_movements_pending_refund_idx")
      .on(t.paidById)
      .where(sql`${t.reimbursable} AND ${t.reimbursedAt} IS NULL`),
    index("cash_movements_client_idx").on(t.clientId),
  ],
);
