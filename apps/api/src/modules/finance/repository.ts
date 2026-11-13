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
const DEBIT = sql`d.kind in ('factura', 'nota_debito') and d.status = 'emitido'`;
const MONTH_START = sql`date_trunc('month', ${todayAr})::date`;

/** "Cuota 2/3 · Web + e-commerce" o "Anticipo · …". */
const INSTALLMENT_LABEL = sql`
  (case when i.number = 0 then 'Anticipo'
        else 'Cuota ' || i.number || '/' || (select count(*) from installments x where x.plan_id = i.plan_id and x.number > 0)
   end) || ' · ' || coalesce(p.name, pl.description)`;

export async function getSummary(db: DbOrTx): Promise<FinanceSummary> {
  const [row] = await db.execute<{
    collected: string;
    receivable: string;
    receivable_count: string;
    overdue: string;
    mrr: string;
  }>(sql`
    with pend as (
      select ${PENDING} as amount, d.due_on from documents d where ${DEBIT}
      union all
      select i.amount, i.due_on from installments i where i.invoice_id is null
    )
    select
      (select coalesce(sum(amount), 0) from documents
        where kind = 'recibo' and status = 'emitido' and issued_on >= ${MONTH_START}) as collected,
      (select coalesce(sum(amount), 0) from pend where amount > 0) as receivable,
      (select count(*) from pend where amount > 0) as receivable_count,
      (select coalesce(sum(amount), 0) from pend where amount > 0 and due_on < ${todayAr}) as overdue,
      (select coalesce(sum(amount), 0) from subscriptions where active) as mrr`);
  return {
    collectedThisMonth: toNumber(row?.collected),
    receivable: toNumber(row?.receivable),
    receivableCount: toNumber(row?.receivable_count),
    overdue: toNumber(row?.overdue),
    monthlyRecurring: toNumber(row?.mrr),
  };
}

export async function listReceivables(db: DbOrTx): Promise<ReceivableDto[]> {
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
             ${PENDING} as amount, d.due_on, (d.due_on - ${todayAr}) as days, null::boolean as auto_reminder
      from documents d join clients c on c.id = d.client_id
      where ${DEBIT}
      union all
      select 'installment', i.id, c.id, c.name, ${INSTALLMENT_LABEL}, i.amount, i.due_on, (i.due_on - ${todayAr}), i.auto_reminder
      from installments i
      join installment_plans pl on pl.id = i.plan_id
      join clients c on c.id = pl.client_id
      left join projects p on p.id = pl.project_id
      where i.invoice_id is null
    ) r
    where r.amount > 0
    order by r.due_on nulls last, r.client_name
    limit 500`);
  return rows.map((r) => ({
    kind: r.kind,
    id: r.id,
    client: { id: r.client_id, name: r.client_name },
    concept: r.concept,
    amount: toNumber(r.amount),
    dueOn: r.due_on,
    daysToDue: r.days === null ? null : toNumber(r.days),
    autoReminder: r.auto_reminder,
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
    plan.collected += amount - pending;
    plan.installments.push({ id: r.id, number: r.number, amount, dueOn: r.due_on, status, pending, autoReminder: r.auto_reminder });
    plans.set(r.plan_id, plan);
  }
  return [...plans.values()];
}

