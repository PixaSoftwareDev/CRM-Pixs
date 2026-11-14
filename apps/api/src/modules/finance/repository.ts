/**
 * Lecturas de Finanzas. "Pendiente" de una factura = importe − lo imputado por
 * recibos y notas de crédito; se calcula siempre en la base (una sola verdad).
 */
import { type DbOrTx, sql } from "@crm/db";
import type {
  CashMovementDto,
  FinanceSummary,
  InstallmentPlanDto,
  PriceAdjustmentDto,
  ReceivableDto,
  SubscriptionDto,
} from "@crm/shared";
import { todayAr, toIso, toNumber } from "../../lib/sql";

/** Saldo pendiente de cada factura / nota de débito emitida. */
export const PENDING = sql`(d.amount - coalesce((select sum(a.amount) from document_allocations a where a.target_id = d.id), 0))`;
/**
 * Saldo a favor de cada cliente: lo cobrado (recibos y notas de crédito) que
 * todavía no está imputado a ninguna factura.
 */
export const CLIENT_CREDIT = sql`(
  select d.client_id, sum(d.amount - coalesce((select sum(a.amount) from document_allocations a where a.source_id = d.id), 0)) as credit
  from documents d
  where d.kind in ('recibo', 'nota_credito') and d.status = 'emitido'
  group by d.client_id
)`;
const DEBIT = sql`d.kind in ('factura', 'nota_debito') and d.status = 'emitido'`;
const MONTH_START = sql`date_trunc('month', ${todayAr})::date`;

/** "Cuota 2/3 · Web + e-commerce" o "Anticipo · …". */
const INSTALLMENT_LABEL = sql`
  (case when i.number = 0 then 'Anticipo'
        else 'Cuota ' || i.number || '/' || (select count(*) from installments x where x.plan_id = i.plan_id and x.number > 0)
   end) || ' · ' || coalesce(p.name, pl.description)`;

export async function getSummary(db: DbOrTx): Promise<FinanceSummary> {
  const [row] = await db.execute<{ collected: string; mrr: string }>(sql`
    select
      (select coalesce(sum(amount), 0) from documents
        where kind = 'recibo' and status = 'emitido' and issued_on >= ${MONTH_START}) as collected,
      (select coalesce(sum(amount), 0) from subscriptions where active) as mrr`);
  // Lo pendiente sale de la misma cuenta que la pestaña Por cobrar: el KPI y la lista siempre coinciden.
  const items = await netReceivables(db);
  return {
    collectedThisMonth: toNumber(row?.collected),
    receivable: items.reduce((a, r) => a + r.amount, 0),
    receivableCount: items.length,
    overdue: items.filter((r) => r.daysToDue !== null && r.daysToDue < 0).reduce((a, r) => a + r.amount, 0),
    monthlyRecurring: toNumber(row?.mrr),
  };
}

/** Un ítem por cobrar con el saldo a favor del cliente ya descontado. */
export interface NetReceivable {
  kind: "invoice" | "installment";
  id: string;
  clientId: string;
  clientName: string;
  concept: string;
  /** Lo que falta cobrar (centavos), ya descontado el saldo a favor. */
  amount: number;
  /** Cuánto de este ítem cubre el saldo a favor del cliente. */
  coveredByCredit: number;
  dueOn: string | null;
  daysToDue: number | null;
  autoReminder: boolean | null;
}

/**
 * Lo que falta cobrar (facturas con saldo y cuotas sin facturar), con el saldo
 * a favor de cada cliente descontado de lo que vence primero. Es la única
 * cuenta de "pendiente": la usan Por cobrar, los KPI y "Cobrada" de una cuota
 * (que cobra exactamente lo que acá se muestra). Los ítems que el saldo a favor
 * cubre del todo no aparecen.
 */
export async function netReceivables(db: DbOrTx, clientId?: string): Promise<NetReceivable[]> {
  const byClient = clientId ? sql`and c.id = ${clientId}` : sql``;
  const rows = await db.execute<{
    kind: "invoice" | "installment";
    id: string;
    client_id: string;
    client_name: string;
    concept: string;
    amount: string;
    due_on: string | null;
    days: number | null;
    auto_reminder: boolean | null;
  }>(sql`
    select * from (
      select 'invoice' as kind, d.id, c.id as client_id, c.name as client_name, d.concept,
             ${PENDING} as amount, d.due_on, (d.due_on - ${todayAr}) as days, null::boolean as auto_reminder,
             0 as kind_rank, d.issued_on, d.number as num
      from documents d join clients c on c.id = d.client_id
      where ${DEBIT} ${byClient}
      union all
      select 'installment', i.id, c.id, c.name, ${INSTALLMENT_LABEL}, i.amount, i.due_on, (i.due_on - ${todayAr}), i.auto_reminder,
             1, null::date, i.number
      from installments i
      join installment_plans pl on pl.id = i.plan_id
      join clients c on c.id = pl.client_id
      left join projects p on p.id = pl.project_id
      where i.invoice_id is null ${byClient}
    ) r
    where r.amount > 0
    -- Orden estable: el saldo a favor se descuenta siempre de los mismos ítems
    -- (y en el mismo orden en que applyCredit imputa las facturas).
    order by r.due_on nulls last, r.client_name, r.client_id, r.kind_rank, r.issued_on, r.num, r.id`);
  // El saldo a favor de cada cliente se descuenta de lo que vence primero.
  const credits = new Map(
    (
      await db.execute<{ client_id: string; credit: string }>(
        sql`select * from ${CLIENT_CREDIT} cr where cr.credit > 0 ${clientId ? sql`and cr.client_id = ${clientId}` : sql``}`,
      )
    ).map((c) => [c.client_id, toNumber(c.credit)]),
  );
  return rows.flatMap((r): NetReceivable[] => {
    const credit = credits.get(r.client_id) ?? 0;
    const amount = toNumber(r.amount);
    const used = Math.min(credit, amount);
    if (used > 0) credits.set(r.client_id, credit - used);
    if (amount - used <= 0) return [];
    return [
      {
        kind: r.kind,
        id: r.id,
        clientId: r.client_id,
        clientName: r.client_name,
        concept: r.concept,
        amount: amount - used,
        coveredByCredit: used,
        dueOn: r.due_on,
        daysToDue: r.days === null ? null : toNumber(r.days),
        autoReminder: r.auto_reminder,
      },
    ];
  });
}

export async function listReceivables(db: DbOrTx): Promise<ReceivableDto[]> {
  const items = await netReceivables(db);
  return items.slice(0, 500).map((r) => ({
    kind: r.kind,
    id: r.id,
    client: { id: r.clientId, name: r.clientName },
    concept: r.coveredByCredit > 0 ? `${r.concept} (descontado el saldo a favor)` : r.concept,
    amount: r.amount,
    dueOn: r.dueOn,
    daysToDue: r.daysToDue,
    autoReminder: r.autoReminder,
  }));
}

/** Facturas con saldo de un cliente, de la más vieja a la más nueva (para imputar cobros). */
export async function pendingInvoices(db: DbOrTx, clientId: string, onlyIds?: string[]) {
  const rows = await db.execute<{ id: string; pending: string }>(sql`
    select d.id, ${PENDING} as pending
    from documents d
    where d.client_id = ${clientId} and ${DEBIT}
      ${onlyIds?.length ? sql`and d.id in ${onlyIds}` : sql``}
    order by d.due_on nulls last, d.issued_on, d.number`);
  return rows.map((r) => ({ id: r.id, pending: toNumber(r.pending) })).filter((r) => r.pending > 0);
}

export async function listSubscriptions(db: DbOrTx): Promise<SubscriptionDto[]> {
  const rows = await db.execute<{
    id: string;
    client_id: string;
    client_name: string;
    name: string;
    amount: string;
    billing_day: number;
    starts_on: string;
    active: boolean;
    previous_amount: string | null;
    last_accrued: string | null;
  }>(sql`
    select s.id, c.id as client_id, c.name as client_name, s.name, s.amount, s.billing_day, s.starts_on, s.active,
           (select pi.previous_amount from price_adjustment_items pi
              join price_adjustments pa on pa.id = pi.adjustment_id
             where pi.subscription_id = s.id order by pa.created_at desc limit 1) as previous_amount,
           (select max(period)::text from documents d where d.subscription_id = s.id) as last_accrued
    from subscriptions s join clients c on c.id = s.client_id
    order by s.active desc, c.name, s.name`);
  return rows.map((r) => ({
    id: r.id,
    client: { id: r.client_id, name: r.client_name },
    name: r.name,
    amount: toNumber(r.amount),
    billingDay: r.billing_day,
    startsOn: r.starts_on,
    active: r.active,
    previousAmount: r.previous_amount === null ? null : toNumber(r.previous_amount),
    lastAccrued: r.last_accrued,
  }));
}

export async function listAdjustments(db: DbOrTx): Promise<PriceAdjustmentDto[]> {
  const rows = await db.execute<{
    id: string;
    effective_on: string;
    percent: string;
    n: string;
    applied_by: string | null;
    note: string | null;
  }>(sql`
    select pa.id, pa.effective_on, pa.percent, pa.note, u.name as applied_by,
           (select count(*) from price_adjustment_items pi where pi.adjustment_id = pa.id) as n
    from price_adjustments pa left join users u on u.id = pa.applied_by_id
    order by pa.effective_on desc, pa.created_at desc
    limit 24`);
  return rows.map((r) => ({
    id: r.id,
    effectiveOn: r.effective_on,
    percent: Number(r.percent),
    count: toNumber(r.n),
    appliedBy: r.applied_by,
    note: r.note,
  }));
}

export async function listCash(db: DbOrTx, month: string): Promise<CashMovementDto[]> {
  const from = `${month}-01`;
  const rows = await db.execute<{
    id: string;
    occurred_on: string;
    direction: "ingreso" | "egreso";
    amount: string;
    concept: string;
    category: string | null;
    client_id: string | null;
    client_name: string | null;
    paid_by_id: string | null;
    paid_by_name: string | null;
    reimbursable: boolean;
    reimbursed_at: Date | null;
  }>(sql`
    select m.id, m.occurred_on, m.direction, m.amount, m.concept, m.category,
           c.id as client_id, c.name as client_name, u.id as paid_by_id, u.name as paid_by_name,
           m.reimbursable, m.reimbursed_at
    from cash_movements m
    left join clients c on c.id = m.client_id
    left join users u on u.id = m.paid_by_id
    -- Del mes pedido, más los gastos a devolver que siguen sin devolverse (de cualquier mes).
    where (m.occurred_on >= ${from}::date and m.occurred_on < (${from}::date + interval '1 month'))
       or (m.reimbursable and m.reimbursed_at is null)
    order by m.occurred_on desc, m.created_at desc
    limit 1000`);
  return rows.map((r) => ({
    id: r.id,
    occurredOn: r.occurred_on,
    direction: r.direction,
    amount: toNumber(r.amount),
    concept: r.concept,
    category: r.category,
    client: r.client_id && r.client_name ? { id: r.client_id, name: r.client_name } : null,
    paidBy: r.paid_by_id && r.paid_by_name ? { id: r.paid_by_id, name: r.paid_by_name } : null,
    reimbursable: r.reimbursable,
    reimbursedAt: r.reimbursed_at ? toIso(r.reimbursed_at) : null,
  }));
}

export async function getProjectPlans(db: DbOrTx, projectId: string): Promise<InstallmentPlanDto[]> {
  const rows = await db.execute<{
    plan_id: string;
    description: string;
    total: string;
    id: string;
    number: number;
    amount: string;
    due_on: string;
    invoice_id: string | null;
    pending: string | null;
    auto_reminder: boolean;
  }>(sql`
    select pl.id as plan_id, pl.description, pl.total, i.id, i.number, i.amount, i.due_on, i.invoice_id, i.auto_reminder,
           (select ${PENDING} from documents d where d.id = i.invoice_id) as pending
    from installment_plans pl
    join installments i on i.plan_id = pl.id
    where pl.project_id = ${projectId}
    order by pl.created_at, i.number`);

  // Lo que "Cobrada" va a cobrar de cada cuota: lo mismo que muestra Por cobrar.
  const [owner] = await db.execute<{ client_id: string }>(sql`select client_id from projects where id = ${projectId}`);
  const net = owner ? await netReceivables(db, owner.client_id) : [];
  const toCollect = new Map(net.map((r) => [`${r.kind}:${r.id}`, r.amount]));

  const plans = new Map<string, InstallmentPlanDto>();
  for (const r of rows) {
    const plan = plans.get(r.plan_id) ?? {
      id: r.plan_id,
      description: r.description,
      total: toNumber(r.total),
      collected: 0,
      installments: [],
    };
    const amount = toNumber(r.amount);
    const pending = r.invoice_id ? toNumber(r.pending) : amount;
    const status = !r.invoice_id ? "pendiente" : pending > 0 ? "facturada" : "cobrada";
    const key = r.invoice_id ? `invoice:${r.invoice_id}` : `installment:${r.id}`;
    plan.collected += amount - pending;
    plan.installments.push({
      id: r.id,
      number: r.number,
      amount,
      dueOn: r.due_on,
      status,
      pending,
      toCollect: pending > 0 ? (toCollect.get(key) ?? 0) : 0,
      autoReminder: r.auto_reminder,
    });
    plans.set(r.plan_id, plan);
  }
  return [...plans.values()];
}
