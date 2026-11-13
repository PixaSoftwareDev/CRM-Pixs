/**
 * Reglas de Finanzas. Todo lo que mueve plata corre en una transacción y deja
 * su rastro: el cobro genera recibo + imputación + ingreso en caja + actividad.
 * La numeración de comprobantes es correlativa por tipo/letra/punto de venta y
 * se toma con un lock transaccional (dos cobros a la vez no repiten número).
 */
import {
  activities,
  cashMovements,
  type Db,
  type DbOrTx,
  documentAllocations,
  documents,
  eq,
  installmentPlans,
  installments,
  priceAdjustmentItems,
  priceAdjustments,
  sql,
  subscriptions,
} from "@pixs/db";
import {
  type AccrualResult,
  type AccrualRun,
  accrualRun,
  type CashMovementCreate,
  cashMovementCreate,
  type InstallmentPay,
  type InstallmentPlanCreate,
  installmentPay,
  installmentPlanCreate,
  type InvoiceCreate,
  invoiceCreate,
  type PaymentCreate,
  type PaymentMethod,
  type PriceAdjustmentCreate,
  paymentCreate,
  priceAdjustmentCreate,
  type SubscriptionCreate,
  type SubscriptionUpdate,
  subscriptionCreate,
  subscriptionUpdate,
} from "@pixs/shared";
import { BadRequestError, ConflictError, NotFoundError } from "../../lib/errors";
import { todayAr } from "../../lib/sql";
import * as repo from "./repository";

export {
  getProjectPlans,
  getSummary,
  listAdjustments,
  listCash,
  listReceivables,
  listSubscriptions,
} from "./repository";

const POINT_OF_SALE = 1;
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const METHOD_LABEL: Record<PaymentMethod, string> = {
  transferencia: "transferencia",
  efectivo: "efectivo",
  tarjeta: "tarjeta",
  mercado_pago: "Mercado Pago",
  cheque: "cheque",
  otro: "otro medio",
};
const pesos = (cents: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(cents / 100);

/** Próximo número del talonario. El lock se libera solo al terminar la transacción. */
async function nextNumber(tx: DbOrTx, kind: string, letter: string | null) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`doc:${kind}:${letter ?? "-"}:${POINT_OF_SALE}`}))`);
  const [row] = await tx.execute<{ n: number }>(sql`
    select coalesce(max(number), 0) + 1 as n from documents
    where kind = ${kind} and letter is not distinct from ${letter} and point_of_sale = ${POINT_OF_SALE}`);
  return Number(row?.n ?? 1);
}

/** Letra y plazo de pago del cliente (de su perfil de facturación). */
async function billingOf(tx: DbOrTx, clientId: string) {
  const [row] = await tx.execute<{ name: string; letter: string | null; term: number | null }>(sql`
    select c.name, b.invoice_letter as letter, b.payment_term_days as term
    from clients c left join client_billing_profiles b on b.client_id = c.id
    where c.id = ${clientId}`);
  if (!row) throw new NotFoundError("Cliente");
  return { name: row.name, letter: (row.letter ?? "B") as "A" | "B" | "C", termDays: row.term ?? 10 };
}

const addDaysIso = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

async function insertInvoice(
  tx: DbOrTx,
  actorId: string | null,
  clientId: string,
  data: {
    concept: string;
    amount: number;
    issuedOn: string;
    dueOn: string | null;
    projectId?: string | null | undefined;
    subscriptionId?: string;
    period?: string;
  },
) {
  const billing = await billingOf(tx, clientId);
  const [doc] = await tx
    .insert(documents)
    .values({
      clientId,
      projectId: data.projectId ?? null,
      kind: "factura",
      letter: billing.letter,
      pointOfSale: POINT_OF_SALE,
      number: await nextNumber(tx, "factura", billing.letter),
      issuedOn: data.issuedOn,
      dueOn: data.dueOn,
      concept: data.concept,
      amount: data.amount,
      subscriptionId: data.subscriptionId ?? null,
      period: data.period ?? null,
      createdById: actorId,
    })
    .returning({ id: documents.id });
  if (!doc) throw new Error("No se pudo emitir la factura");
  return doc.id;
}

// ─── Cobros ─────────────────────────────────────────────────────────────────

/** Recibo + imputación + caja + actividad. Lo que sobra queda a favor del cliente. */
async function registerPaymentTx(tx: DbOrTx, actorId: string, clientId: string, data: ReturnType<typeof paymentCreate.parse>) {
  const { name } = await billingOf(tx, clientId);
  const targets = await repo.pendingInvoices(tx, clientId, data.invoiceIds);
  if (data.invoiceIds?.length && targets.length === 0) throw new ConflictError("Esa factura ya está cobrada");

  const [receipt] = await tx
    .insert(documents)
    .values({
      clientId,
      kind: "recibo",
      letter: null,
      pointOfSale: POINT_OF_SALE,
      number: await nextNumber(tx, "recibo", null),
      issuedOn: data.receivedOn,
      concept: data.note || `Cobro por ${METHOD_LABEL[data.method]}`,
      amount: data.amount,
      paymentMethod: data.method,
      createdById: actorId,
    })
    .returning({ id: documents.id, number: documents.number });
  if (!receipt) throw new Error("No se pudo emitir el recibo");

  let left = data.amount;
  for (const t of targets) {
    if (left <= 0) break;
    const amount = Math.min(left, t.pending);
    await tx.insert(documentAllocations).values({ sourceId: receipt.id, targetId: t.id, amount });
    left -= amount;
  }

  await tx.insert(cashMovements).values({
    occurredOn: data.receivedOn,
    direction: "ingreso",
    amount: data.amount,
    concept: `Cobro · ${name}`,
    category: "Cobros",
    clientId,
    documentId: receipt.id,
    createdById: actorId,
  });
  await tx.insert(activities).values({
    clientId,
    actorId,
    documentId: receipt.id,
    kind: "cobro",
    title: "Cobro registrado",
    body: `${pesos(data.amount)} por ${METHOD_LABEL[data.method]}${left > 0 ? ` (${pesos(left)} quedan a favor)` : ""}.`,
  });
  return { receiptId: receipt.id, number: receipt.number, allocated: data.amount - left, credit: left };
}

export async function registerPayment(db: Db, actorId: string, clientId: string, input: PaymentCreate) {
  const data = paymentCreate.parse(input);
  return db.transaction((tx) => registerPaymentTx(tx, actorId, clientId, data));
}

export async function createInvoice(db: Db, actorId: string, clientId: string, input: InvoiceCreate) {
  const data = invoiceCreate.parse(input);
  if (data.dueOn && data.dueOn < data.issuedOn) throw new BadRequestError("El vencimiento no puede ser antes de la emisión");
  return db.transaction(async (tx) => {
    const { termDays } = await billingOf(tx, clientId);
    const id = await insertInvoice(tx, actorId, clientId, {
      ...data,
      dueOn: data.dueOn === undefined ? addDaysIso(data.issuedOn, termDays) : data.dueOn,
    });
    await tx.insert(activities).values({ clientId, actorId, documentId: id, kind: "factura", title: "Factura emitida", body: `${data.concept} · ${pesos(data.amount)}` });
    return { id };
  });
}

// ─── Cuotas ─────────────────────────────────────────────────────────────────

export async function createInstallmentPlan(db: Db, projectId: string, input: InstallmentPlanCreate) {
  const data = installmentPlanCreate.parse(input);
  const [project] = await db.execute<{ client_id: string }>(sql`select client_id from projects where id = ${projectId}`);
  if (!project) throw new NotFoundError("Proyecto");
  return db.transaction(async (tx) => {
    const [plan] = await tx
      .insert(installmentPlans)
      .values({
        clientId: project.client_id,
        projectId,
        description: data.description,
        total: data.items.reduce((a, i) => a + i.amount, 0),
      })
      .returning({ id: installmentPlans.id });
    if (!plan) throw new Error("No se pudo crear el plan");
    await tx.insert(installments).values(data.items.map((i) => ({ ...i, planId: plan.id })));
    return plan;
  });
}

async function findInstallment(db: DbOrTx, id: string) {
  const [row] = await db.execute<{
    id: string;
    number: number;
    amount: string;
    due_on: string;
    invoice_id: string | null;
    client_id: string;
    project_id: string | null;
    label: string;
  }>(sql`
    select i.id, i.number, i.amount, i.due_on, i.invoice_id, pl.client_id, pl.project_id,
           (case when i.number = 0 then 'Anticipo'
                 else 'Cuota ' || i.number || '/' || (select count(*) from installments x where x.plan_id = i.plan_id and x.number > 0)
            end) || ' · ' || coalesce(p.name, pl.description) as label
    from installments i
    join installment_plans pl on pl.id = i.plan_id
    left join projects p on p.id = pl.project_id
    where i.id = ${id}`);
  if (!row) throw new NotFoundError("Cuota");
  return { ...row, amount: Number(row.amount) };
}

/** "Cobrada" sobre una cuota sin facturar: se factura y se cobra en una sola transacción. */
export async function payInstallment(db: Db, actorId: string, id: string, input: InstallmentPay) {
  const data = installmentPay.parse(input);
  return db.transaction(async (tx) => {
    // Bloquea la cuota: dos "Cobrada" a la vez no la facturan dos veces.
    await tx.execute(sql`select 1 from installments where id = ${id} for update`);
    const inst = await findInstallment(tx, id);
    let invoiceId = inst.invoice_id;
    if (!invoiceId) {
      invoiceId = await insertInvoice(tx, actorId, inst.client_id, {
        concept: inst.label,
        amount: inst.amount,
        issuedOn: data.receivedOn,
        dueOn: inst.due_on,
        projectId: inst.project_id,
      });
      await tx.update(installments).set({ invoiceId, updatedAt: new Date() }).where(eq(installments.id, id));
    }
    const pending = await repo.pendingInvoices(tx, inst.client_id, [invoiceId]);
    const amount = pending[0]?.pending ?? 0;
    if (amount <= 0) throw new ConflictError("Esa cuota ya está cobrada");
    return registerPaymentTx(tx, actorId, inst.client_id, {
      amount,
      method: data.method,
      receivedOn: data.receivedOn,
      note: inst.label,
      invoiceIds: [invoiceId],
    });
  });
}

export async function setInstallmentReminder(db: Db, id: string, autoReminder: boolean) {
  const res = await db.update(installments).set({ autoReminder, updatedAt: new Date() }).where(eq(installments.id, id)).returning({ id: installments.id });
  if (!res.length) throw new NotFoundError("Cuota");
}

// ─── Abonos ─────────────────────────────────────────────────────────────────

export async function createSubscription(db: Db, input: SubscriptionCreate) {
  const data = subscriptionCreate.parse(input);
  const [client] = await db.execute(sql`select 1 from clients where id = ${data.clientId}`);
  if (!client) throw new BadRequestError("El cliente no existe");
  const [row] = await db.insert(subscriptions).values(data).returning({ id: subscriptions.id });
  return row;
}

export async function updateSubscription(db: Db, id: string, input: SubscriptionUpdate) {
  const data = subscriptionUpdate.parse(input);
  const patch = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) as Partial<typeof subscriptions.$inferInsert>;
  // Dar de baja un abono lo cierra hoy; reactivarlo lo deja abierto otra vez.
  if (data.active === false) {
    const [today] = await db.execute<{ d: string }>(sql`select ${todayAr}::text as d`);
    patch.endsOn = today?.d ?? null;
  }
  if (data.active === true) patch.endsOn = null;
  const res = await db
    .update(subscriptions)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(subscriptions.id, id))
    .returning({ id: subscriptions.id });
  if (!res.length) throw new NotFoundError("Abono");
}

/** Aumento masivo: nuevo valor redondeado al peso, con el anterior guardado en el historial. */
export async function adjustPrices(db: Db, actorId: string, input: PriceAdjustmentCreate) {
  const data = priceAdjustmentCreate.parse(input);
  return db.transaction(async (tx) => {
    const subs = await tx.execute<{ id: string; amount: string }>(sql`
      select id, amount from subscriptions where id in ${data.subscriptionIds} and active for update`);
    if (subs.length === 0) throw new BadRequestError("Ninguno de esos abonos está activo");
    const [adj] = await tx
      .insert(priceAdjustments)
      .values({ effectiveOn: data.effectiveOn, percent: data.percent.toFixed(2), note: data.note || null, appliedById: actorId })
      .returning({ id: priceAdjustments.id });
    if (!adj) throw new Error("No se pudo registrar el aumento");
    for (const s of subs) {
      const previous = Number(s.amount);
      const next = Math.round((previous * (1 + data.percent / 100)) / 100) * 100;
      await tx.insert(priceAdjustmentItems).values({ adjustmentId: adj.id, subscriptionId: s.id, previousAmount: previous, newAmount: next });
      await tx.update(subscriptions).set({ amount: next, updatedAt: new Date() }).where(eq(subscriptions.id, s.id));
    }
    return { id: adj.id, count: subs.length };
  });
}

/**
 * Devengamiento: la factura del mes de cada abono activo. Es idempotente
 * (índice único abono + mes): correrlo dos veces no duplica.
 */
export async function runAccrual(db: Db, actorId: string | null, input: AccrualRun): Promise<AccrualResult> {
  const { month } = accrualRun.parse(input);
  const period = `${month}-01`;
  const monthName = MONTHS[Number(month.slice(5, 7)) - 1] ?? "";

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`accrual:${period}`}))`);
    const due = await tx.execute<{ id: string; client_id: string; client_name: string; name: string; amount: string; billing_day: number; billed: boolean }>(sql`
      select s.id, s.client_id, c.name as client_name, s.name, s.amount, s.billing_day,
             exists (select 1 from documents d where d.subscription_id = s.id and d.period = ${period}::date) as billed
      from subscriptions s join clients c on c.id = s.client_id
      where s.active
        and s.starts_on < (${period}::date + interval '1 month')
        and (s.ends_on is null or s.ends_on >= ${period}::date)
      order by c.name, s.name`);

    const created: AccrualResult["created"] = [];
    for (const s of due) {
      if (s.billed) continue;
      const amount = Number(s.amount);
      const issuedOn = `${month}-${String(s.billing_day).padStart(2, "0")}`;
      const { termDays } = await billingOf(tx, s.client_id);
      const concept = `Abono ${monthName} · ${s.name}`;
      const id = await insertInvoice(tx, actorId, s.client_id, {
        concept,
        amount,
        issuedOn,
        dueOn: addDaysIso(issuedOn, termDays),
        subscriptionId: s.id,
        period,
      });
      await tx.insert(activities).values({ clientId: s.client_id, actorId, documentId: id, kind: "factura", title: "Factura de abono", body: `${concept} · ${pesos(amount)}` });
      created.push({ client: s.client_name, concept, amount });
    }
    return { created, skipped: due.length - created.length };
  });
}

// ─── Caja ───────────────────────────────────────────────────────────────────

export async function createCashMovement(db: Db, actorId: string, input: CashMovementCreate) {
  const data = cashMovementCreate.parse(input);
  if (data.reimbursable && !data.paidById) throw new BadRequestError("Indicá quién puso la plata");
  const [row] = await db
    .insert(cashMovements)
    .values({ ...data, category: data.category || null, paidById: data.paidById ?? null, createdById: actorId })
    .returning({ id: cashMovements.id });
  return row;
}

export async function markReimbursed(db: Db, id: string) {
  const res = await db
    .update(cashMovements)
    .set({ reimbursedAt: new Date(), updatedAt: new Date() })
    .where(sql`${cashMovements.id} = ${id} and ${cashMovements.reimbursable} and ${cashMovements.reimbursedAt} is null`)
    .returning({ id: cashMovements.id });
  if (!res.length) throw new ConflictError("Ese gasto no está pendiente de devolución");
}
