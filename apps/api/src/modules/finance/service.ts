/**
 * Reglas de Finanzas. Todo lo que mueve plata corre en una transacción y deja
 * su rastro: el cobro genera recibo + imputación + ingreso en caja + actividad.
 * La numeración de comprobantes es correlativa por tipo/letra/punto de venta y
 * se toma con un lock transaccional (dos cobros a la vez no repiten número).
 * Todo lo que imputa (cobros, facturas, cuotas, devengamiento) bloquea antes la
 * fila del cliente: dos operaciones sobre el mismo cliente nunca leen el mismo
 * saldo pendiente a la vez. Orden de locks: cliente(s) → talonario.
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
} from "@crm/db";
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
  type PaymentResult,
  type PriceAdjustmentCreate,
  paymentCreate,
  priceAdjustmentCreate,
  type SubscriptionCreate,
  type SubscriptionUpdate,
  subscriptionCreate,
  subscriptionUpdate,
  todayInArgentina,
} from "@crm/shared";
import { BadRequestError, ConflictError, NotFoundError } from "../../lib/errors";
import { todayAr } from "../../lib/sql";
import * as repo from "./repository";

export async function getProjectPlans(db: Db, projectId: string) {
  const [project] = await db.execute(sql`select 1 from projects where id = ${projectId}`);
  if (!project) throw new NotFoundError("Proyecto");
  return repo.getProjectPlans(db, projectId);
}

export {
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
/** "$ 4.445" o, si hay centavos, "$ 4.444,50" (no se redondean para que los saldos cierren). */
const pesos = (cents: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);

/**
 * Serializa todo lo que mueve la cuenta corriente de un cliente hasta el fin de
 * la transacción. FOR NO KEY UPDATE no choca con los FK que apuntan al cliente
 * (tareas, actividades) pero sí con otro cobro/factura del mismo cliente.
 * Varios clientes se bloquean siempre en el mismo orden (por id) para no trabarse.
 */
async function lockClients(tx: DbOrTx, clientIds: string[]) {
  const ids = [...new Set(clientIds)].sort();
  if (!ids.length) return;
  const rows = await tx.execute<{ id: string }>(sql`select id from clients where id in ${ids} order by id for no key update`);
  if (rows.length < ids.length) throw new NotFoundError("Cliente");
}

/** Comprobantes que imputó cada transacción (para el control del final). */
const touchedByTx = new WeakMap<DbOrTx, Set<string>>();

/** Toda imputación pasa por acá: queda anotada para assertAllocations. */
async function allocate(tx: DbOrTx, sourceId: string, targetId: string, amount: number) {
  await tx.insert(documentAllocations).values({ sourceId, targetId, amount });
  const touched = touchedByTx.get(tx) ?? new Set<string>();
  touched.add(sourceId).add(targetId);
  touchedByTx.set(tx, touched);
}

/**
 * Red de seguridad: lo que imputó esta transacción no deja ninguna factura con
 * más imputado que su total, ni un recibo / nota de crédito imputando más de lo
 * que vale. Solo mira lo tocado ahora: datos viejos no bloquean cobros nuevos.
 */
async function assertAllocations(tx: DbOrTx) {
  const ids = [...(touchedByTx.get(tx) ?? [])];
  if (!ids.length) return;
  const [bad] = await tx.execute(sql`
    select 1 from documents d
    where d.id in ${ids}
      and (d.amount < coalesce((select sum(a.amount) from document_allocations a where a.target_id = d.id), 0)
        or d.amount < coalesce((select sum(a.amount) from document_allocations a where a.source_id = d.id), 0))
    limit 1`);
  if (bad) throw new ConflictError("Otro cobro de este cliente se registró al mismo tiempo. Probá de nuevo.");
}

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
    /** Factura cargada a mano: la emisión no puede ser anterior a la última del talonario. */
    inOrder?: boolean;
  },
) {
  const billing = await billingOf(tx, clientId);
  // Con el talonario bloqueado (nextNumber), así nadie emite otra en el medio.
  const number = await nextNumber(tx, "factura", billing.letter);
  if (data.inOrder) {
    // Las fechadas a futuro (de antes de esta regla) no cuentan: si no, trabarían todo el talonario.
    const [last] = await tx.execute<{ d: string | null }>(sql`
      select max(issued_on)::text as d from documents
      where kind = 'factura' and letter is not distinct from ${billing.letter} and point_of_sale = ${POINT_OF_SALE}
        and issued_on <= ${todayInArgentina()}`);
    if (last?.d && data.issuedOn < last.d) {
      const [y, m, d] = last.d.split("-");
      throw new BadRequestError(
        `La última factura ${billing.letter} es del ${d}/${m}/${y}: la emisión no puede ser anterior (el número y la fecha tienen que avanzar juntos).`,
      );
    }
  }
  const [doc] = await tx
    .insert(documents)
    .values({
      clientId,
      projectId: data.projectId ?? null,
      kind: "factura",
      letter: billing.letter,
      pointOfSale: POINT_OF_SALE,
      number,
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

/**
 * Imputa el saldo a favor del cliente (recibos y notas de crédito con resto
 * libre) a sus facturas pendientes, de la más vieja a la más nueva. Se llama
 * cada vez que aparece una factura nueva o un cobro deja resto.
 */
async function applyCredit(tx: DbOrTx, clientId: string) {
  return allocateCredit(tx, clientId, await repo.pendingInvoices(tx, clientId));
}

/** Imputa saldo a favor (lo más viejo primero) a las facturas dadas, hasta `pending` de cada una. */
async function allocateCredit(tx: DbOrTx, clientId: string, targets: { id: string; pending: number }[]) {
  await lockClients(tx, [clientId]);
  const sources = await tx.execute<{ id: string; free: string }>(sql`
    select d.id, d.amount - coalesce((select sum(a.amount) from document_allocations a where a.source_id = d.id), 0) as free
    from documents d
    where d.client_id = ${clientId} and d.kind in ('recibo', 'nota_credito') and d.status = 'emitido'
    order by d.issued_on, d.number`);
  const credits = sources.map((r) => ({ id: r.id, free: Number(r.free) })).filter((r) => r.free > 0);
  if (!credits.length) return 0;
  let applied = 0;
  for (const t of targets) {
    let pending = t.pending;
    for (const c of credits) {
      if (pending <= 0) break;
      if (c.free <= 0) continue;
      const amount = Math.min(pending, c.free);
      await allocate(tx, c.id, t.id, amount);
      c.free -= amount;
      pending -= amount;
      applied += amount;
    }
  }
  if (applied > 0) {
    await tx.insert(activities).values({
      clientId,
      kind: "sistema",
      title: "Saldo a favor aplicado",
      body: `${pesos(applied)} de saldo a favor se descontaron de facturas pendientes.`,
    });
  }
  return applied;
}

// ─── Cobros ─────────────────────────────────────────────────────────────────

/** Recibo + imputación + caja + actividad. Lo que sobra queda a favor del cliente. */
async function registerPaymentTx(tx: DbOrTx, actorId: string, clientId: string, data: ReturnType<typeof paymentCreate.parse>) {
  // Primero el lock: el pendiente de las facturas se lee recién cuando nadie más puede imputarlas.
  await lockClients(tx, [clientId]);
  const { name } = await billingOf(tx, clientId);
  if (data.invoiceIds?.length) {
    const found = await tx.execute<{ client_id: string }>(sql`select client_id from documents where id in ${data.invoiceIds} and kind in ('factura', 'nota_debito')`);
    if (found.length < new Set(data.invoiceIds).size) throw new BadRequestError("Esa factura no existe");
    if (found.some((d) => d.client_id !== clientId)) throw new BadRequestError("Esa factura es de otro cliente");
  }
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
    await allocate(tx, receipt.id, t.id, amount);
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
  // Si sobró y hay otras facturas con saldo, el resto se imputa ahí.
  const reapplied = left > 0 ? await applyCredit(tx, clientId) : 0;
  await assertAllocations(tx);
  return {
    receiptId: receipt.id,
    number: receipt.number,
    allocated: data.amount - left + reapplied,
    credit: left - reapplied,
    fromCredit: 0,
  } satisfies PaymentResult;
}

export async function registerPayment(db: Db, actorId: string, clientId: string, input: PaymentCreate) {
  const data = paymentCreate.parse(input);
  return db.transaction((tx) => registerPaymentTx(tx, actorId, clientId, data));
}

export async function createInvoice(db: Db, actorId: string, clientId: string, input: InvoiceCreate) {
  const data = invoiceCreate.parse(input);
  if (data.dueOn && data.dueOn < data.issuedOn) throw new BadRequestError("El vencimiento no puede ser antes de la emisión");
  if (data.projectId) {
    const [p] = await db.execute(sql`select 1 from projects where id = ${data.projectId} and client_id = ${clientId}`);
    if (!p) throw new BadRequestError("El proyecto no es de ese cliente");
  }
  return db.transaction(async (tx) => {
    await lockClients(tx, [clientId]);
    const { termDays } = await billingOf(tx, clientId);
    const id = await insertInvoice(tx, actorId, clientId, {
      ...data,
      dueOn: data.dueOn === undefined ? addDaysIso(data.issuedOn, termDays) : data.dueOn,
      inOrder: true,
    });
    await tx.insert(activities).values({ clientId, actorId, documentId: id, kind: "factura", title: "Factura emitida", body: `${data.concept} · ${pesos(data.amount)}` });
    await applyCredit(tx, clientId);
    await assertAllocations(tx);
    return { id };
  });
}

// ─── Cuotas ─────────────────────────────────────────────────────────────────

export async function createInstallmentPlan(db: Db, projectId: string, input: InstallmentPlanCreate) {
  const data = installmentPlanCreate.parse(input);
  const [project] = await db.execute<{ client_id: string; sale_amount: string | null; planned: string }>(sql`
    select client_id, sale_amount,
           (select coalesce(sum(total), 0) from installment_plans where project_id = ${projectId}) as planned
    from projects where id = ${projectId}`);
  if (!project) throw new NotFoundError("Proyecto");
  // Las cuotas no pueden sumar más que lo que se vendió (contando los planes que ya tiene).
  const total = data.items.reduce((a, i) => a + i.amount, 0);
  const sale = project.sale_amount === null ? null : Number(project.sale_amount);
  const planned = Number(project.planned);
  if (sale !== null && sale > 0 && planned + total > sale) {
    throw new BadRequestError(
      planned > 0
        ? `Con este plan las cuotas sumarían ${pesos(planned + total)} y la venta fue de ${pesos(sale)} (ya hay planes por ${pesos(planned)}).`
        : `El plan suma ${pesos(total)} y la venta fue de ${pesos(sale)}: no puede ser mayor.`,
    );
  }
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

/**
 * "Cobrada" sobre una cuota: si no está facturada se factura, se le aplica el
 * saldo a favor que Por cobrar ya le descontaba y se cobra solo lo que falta
 * (lo mismo que se mostraba). Si el saldo a favor la cubre entera, no hay recibo
 * ni ingreso nuevo: esa plata ya entró con el cobro anterior.
 */
export async function payInstallment(db: Db, actorId: string, id: string, input: InstallmentPay): Promise<PaymentResult> {
  const data = installmentPay.parse(input);
  return db.transaction(async (tx) => {
    const [owner] = await tx.execute<{ client_id: string }>(sql`
      select pl.client_id from installments i join installment_plans pl on pl.id = i.plan_id where i.id = ${id}`);
    if (!owner) throw new NotFoundError("Cuota");
    await lockClients(tx, [owner.client_id]);
    // Bloquea la cuota: dos "Cobrada" a la vez no la facturan dos veces.
    await tx.execute(sql`select 1 from installments where id = ${id} for update`);
    const inst = await findInstallment(tx, id);
    let invoiceId = inst.invoice_id;
    let fromCredit = 0;
    if (!invoiceId) {
      // Lo que Por cobrar muestra para esta cuota (con el saldo a favor descontado).
      const shown = (await repo.netReceivables(tx, inst.client_id)).find((r) => r.kind === "installment" && r.id === id);
      const toCollect = shown?.amount ?? 0;
      invoiceId = await insertInvoice(tx, actorId, inst.client_id, {
        concept: inst.label,
        amount: inst.amount,
        issuedOn: data.receivedOn,
        dueOn: inst.due_on,
        projectId: inst.project_id,
      });
      await tx.update(installments).set({ invoiceId, updatedAt: new Date() }).where(eq(installments.id, id));
      if (inst.amount > toCollect) {
        fromCredit = await allocateCredit(tx, inst.client_id, [{ id: invoiceId, pending: inst.amount - toCollect }]);
      }
    } else {
      // Ya facturada: si quedó saldo a favor suelto, se usa antes de cobrar.
      fromCredit = await allocateCredit(tx, inst.client_id, await repo.pendingInvoices(tx, inst.client_id, [invoiceId]));
    }
    const pending = await repo.pendingInvoices(tx, inst.client_id, [invoiceId]);
    const amount = pending[0]?.pending ?? 0;
    if (amount <= 0) {
      if (fromCredit > 0) {
        await assertAllocations(tx);
        return { receiptId: null, number: null, allocated: 0, credit: 0, fromCredit };
      }
      throw new ConflictError("Esa cuota ya está cobrada");
    }
    const res = await registerPaymentTx(tx, actorId, inst.client_id, {
      amount,
      method: data.method,
      receivedOn: data.receivedOn,
      note: inst.label,
      invoiceIds: [invoiceId],
    });
    return { ...res, fromCredit };
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
    const due = await tx.execute<{
      id: string;
      client_id: string;
      client_name: string;
      name: string;
      amount: string;
      billing_day: number;
      starts_on: string;
      billed: boolean;
    }>(sql`
      select s.id, s.client_id, c.name as client_name, s.name, s.billing_day, s.starts_on::text as starts_on,
             -- Un aumento que rige más adelante todavía no cuenta: se usa el valor anterior.
             coalesce((select pi.previous_amount from price_adjustment_items pi
                         join price_adjustments pa on pa.id = pi.adjustment_id
                        where pi.subscription_id = s.id and pa.effective_on > ${period}::date
                        order by pa.effective_on, pa.created_at limit 1), s.amount) as amount,
             exists (select 1 from documents d where d.subscription_id = s.id and d.period = ${period}::date) as billed
      from subscriptions s join clients c on c.id = s.client_id
      where s.active
        and c.status <> 'baja' -- un cliente dado de baja no se sigue facturando
        and s.starts_on < (${period}::date + interval '1 month')
        and (s.ends_on is null or s.ends_on >= ${period}::date)
      order by c.name, s.name`);

    // Todos los clientes a facturar se bloquean juntos y antes de numerar (mismo orden que un cobro).
    await lockClients(tx, due.filter((s) => !s.billed).map((s) => s.client_id));
    const created: AccrualResult["created"] = [];
    for (const s of due) {
      if (s.billed) continue;
      // Primer mes de un abono que arranca a mitad de mes: se cobran solo los días que usa (redondeado al peso).
      const daysInMonth = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
      const startDay = s.starts_on.startsWith(month) ? Number(s.starts_on.slice(8, 10)) : 1;
      const full = Number(s.amount);
      const amount = startDay > 1 ? Math.round((full * (daysInMonth - startDay + 1)) / daysInMonth / 100) * 100 : full;
      const billingDate = `${month}-${String(s.billing_day).padStart(2, "0")}`;
      const issuedOn = startDay > 1 && s.starts_on > billingDate ? s.starts_on : billingDate;
      const { termDays } = await billingOf(tx, s.client_id);
      const concept = `Abono ${monthName}${startDay > 1 ? ` (desde el ${startDay})` : ""} · ${s.name}`;
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
      await applyCredit(tx, s.client_id);
    }
    await assertAllocations(tx);
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
  if (!res.length) {
    const [exists] = await db.execute(sql`select 1 from cash_movements where id = ${id}`);
    if (!exists) throw new NotFoundError("Movimiento");
    throw new ConflictError("Ese gasto no está pendiente de devolución");
  }
}
