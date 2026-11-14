/**
 * Acceso a datos de Clientes. Solo consultas: sin reglas de negocio (eso va en service.ts).
 * Los datos derivados (saldo, deuda vencida, último contacto, próxima tarea) se calculan
 * con subconsultas correlacionadas sobre índices, solo para las filas de la página.
 */
import {
  activities,
  and,
  clientBillingProfiles,
  clientContacts,
  clients,
  type DbOrTx,
  desc,
  eq,
  exists,
  ne,
  or,
  type SQL,
  sql,
  users,
} from "@crm/db";
import { cuitSearchDigits } from "@crm/shared";
import type {
  ActivityDto,
  ClientDetail,
  ClientListItem,
  ClientListQuery,
  ClientProjectDto,
  ClientSummaryCounts,
  ClientTaskDto,
  StatementDto,
  ProjectPhase,
  ProjectStatus,
  StatementRow,
  TaskStatus,
} from "@crm/shared";
import { z } from "zod";
import { decodeCursor, likePattern, matches, toPage } from "../../lib/cursor";
import { todayAr, toIso, toNumber } from "../../lib/sql";
import { progressOf } from "../projects/repository";

// ─── Fragmentos reutilizables ───────────────────────────────────────────────

const CONTACT_KINDS = sql`('llamada', 'reunion', 'whatsapp', 'email')`;
const OPEN_TICKET = sql`status NOT IN ('resuelto', 'cancelado')`;
/** Tickets visibles: ni él ni su proyecto están dados de baja (baja lógica). */
const LIVE_TICKET = sql`(t.archived_at is null and not exists (
  select 1 from projects pa where pa.id = t.project_id and pa.archived_at is not null
))`;

/** Saldo de cuenta corriente: debe (facturas, ND) − haber (recibos, NC). */
const balanceOf = (clientId: SQL | string) => sql`coalesce((
  select sum(case when d.kind in ('factura', 'nota_debito') then d.amount else -d.amount end)
  from documents d where d.client_id = ${clientId} and d.status = 'emitido'
), 0)`;

/**
 * Deuda vencida: saldo de facturas vencidas + cuotas vencidas sin facturar,
 * menos el saldo a favor (nunca negativa). Misma cuenta que "Vencido" en Finanzas.
 */
const overdueAmountOf = (clientId: SQL | string) => sql`greatest(
  coalesce((
    select sum(f.amount - coalesce((select sum(a.amount) from document_allocations a where a.target_id = f.id), 0))
    from documents f
    where f.client_id = ${clientId}
      and f.kind in ('factura', 'nota_debito') and f.status = 'emitido'
      and f.due_on < ${todayAr}
      and f.amount > coalesce((select sum(a.amount) from document_allocations a where a.target_id = f.id), 0)
  ), 0)
  + coalesce((
    select sum(i.amount) from installments i join installment_plans pl on pl.id = i.plan_id
    where pl.client_id = ${clientId} and i.invoice_id is null and i.due_on < ${todayAr}
  ), 0)
  - coalesce((
    select sum(r.amount - coalesce((select sum(a.amount) from document_allocations a where a.source_id = r.id), 0))
    from documents r
    where r.client_id = ${clientId} and r.kind in ('recibo', 'nota_credito') and r.status = 'emitido'
  ), 0),
  0)`;

/** ¿Debe algo vencido (facturas o cuotas sin facturar), descontado el saldo a favor? */
const overdueOf = (clientId: SQL | string) => sql`(${overdueAmountOf(clientId)} > 0)`;

const lastContactOf = (clientId: SQL | string) => sql`(
  select max(a.occurred_at) from activities a
  where a.client_id = ${clientId} and a.kind in ${CONTACT_KINDS}
)`;

const cid = sql`${clients.id}`;

// ─── Listado ────────────────────────────────────────────────────────────────

const listCursor = z.object({ n: z.string(), i: z.uuid() });

/** Filtros del listado (estado, prioridad, búsqueda): los mismos para las filas y para el contador. */
function listFilters(db: DbOrTx, query: Pick<ClientListQuery, "q" | "status" | "priority">): SQL[] {
  const filters: SQL[] = [];

  // "Todos" (sin estado) son los vigentes: los de baja solo aparecen con su filtro, también al buscar.
  filters.push(query.status ? eq(clients.status, query.status) : ne(clients.status, "baja"));
  if (query.priority) filters.push(eq(clients.priority, query.priority));
  if (query.q) {
    const pattern = likePattern(query.q);
    const byContact = db
      .select({ one: sql`1` })
      .from(clientContacts)
      .where(and(eq(clientContacts.clientId, clients.id), matches(clientContacts.name, pattern)));
    // El CUIT se guarda solo con dígitos: "30-71234567" o "30 7123" lo encuentran igual.
    const cuitDigits = cuitSearchDigits(query.q);
    const match = or(
      matches(clients.name, pattern),
      matches(clients.email, pattern),
      exists(byContact),
      cuitDigits ? sql`${clients.taxId} like ${`%${cuitDigits}%`}` : undefined,
    );
    if (match) filters.push(match);
  }
  return filters;
}

export async function listClients(db: DbOrTx, query: ClientListQuery) {
  const after = decodeCursor(query.cursor, listCursor);
  const filters = listFilters(db, query);
  if (after) filters.push(sql`(${clients.name}, ${clients.id}) > (${after.n}, ${after.i})`);

  const rows = await db
    .select({
      id: clients.id,
      name: clients.name,
      status: clients.status,
      priority: clients.priority,
      statusReason: clients.statusReason,
      email: clients.email,
      mainContact: sql<string | null>`(
        select c.name from client_contacts c where c.client_id = ${cid}
        order by c.is_decision_maker desc, c.created_at limit 1
      )`,
      balance: sql<number>`${balanceOf(cid)}`.mapWith(toNumber),
      hasOverdueDebt: sql<boolean>`${overdueOf(cid)}`,
      lastContactAt: sql<string | null>`${lastContactOf(cid)}`.mapWith(toIso),
      nextTask: sql<{ title: string; startsAt: string | null } | null>`(
        select json_build_object('title', t.title, 'startsAt', t.starts_at)
        from tasks t
        where t.client_id = ${cid} and t.status in ('pendiente', 'en_curso') and t.archived_at is null
        order by t.starts_at nulls last limit 1
      )`,
    })
    .from(clients)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(clients.name, clients.id)
    .limit(query.limit + 1);

  const page = toPage(rows, query.limit, (last) => ({ n: last.name, i: last.id }));
  return {
    nextCursor: page.nextCursor,
    items: page.items.map(
      (r): ClientListItem => ({
        ...r,
        nextTask: r.nextTask && {
          title: r.nextTask.title,
          startsAt: r.nextTask.startsAt ? toIso(r.nextTask.startsAt) : null,
        },
      }),
    ),
  };
}

/** Contador del encabezado: cuenta lo mismo que muestra el listado con esos filtros. */
export async function countClients(
  db: DbOrTx,
  query: Pick<ClientListQuery, "q" | "status" | "priority"> = {},
): Promise<ClientSummaryCounts> {
  const [row] = await db
    .select({
      total: sql<number>`count(*)`.mapWith(toNumber),
      highPriority: sql<number>`count(*) filter (where ${clients.priority} = 'alta')`.mapWith(toNumber),
      atRisk: sql<number>`count(*) filter (where ${clients.status} = 'en_riesgo')`.mapWith(toNumber),
    })
    .from(clients)
    .where(and(...listFilters(db, query)));
  return row ?? { total: 0, highPriority: 0, atRisk: 0 };
}

// ─── Ficha (Cliente 360) ────────────────────────────────────────────────────

export async function findClient(db: DbOrTx, id: string) {
  const [row] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  return row ?? null;
}

export async function getClientDetail(db: DbOrTx, id: string): Promise<ClientDetail | null> {
  const client = await findClient(db, id);
  if (!client) return null;

  const [contacts, [billing], [summary]] = await Promise.all([
    db
      .select({
        id: clientContacts.id,
        name: clientContacts.name,
        jobTitle: clientContacts.jobTitle,
        phone: clientContacts.phone,
        email: clientContacts.email,
        isDecisionMaker: clientContacts.isDecisionMaker,
        handlesPayments: clientContacts.handlesPayments,
        handlesSupport: clientContacts.handlesSupport,
      })
      .from(clientContacts)
      .where(eq(clientContacts.clientId, id))
      .orderBy(desc(clientContacts.isDecisionMaker), clientContacts.createdAt),
    db
      .select({
        invoiceLetter: clientBillingProfiles.invoiceLetter,
        fiscalAddress: clientBillingProfiles.fiscalAddress,
        billingEmail: clientBillingProfiles.billingEmail,
        paymentTermDays: clientBillingProfiles.paymentTermDays,
        bankAccount: clientBillingProfiles.bankAccount,
      })
      .from(clientBillingProfiles)
      .where(eq(clientBillingProfiles.clientId, id)),
    db.execute<{
      balance: string;
      has_overdue_debt: boolean;
      overdue_amount: string;
      monthly_subscriptions: string;
      active_projects: string;
      open_tickets: string;
      last_contact_at: Date | null;
    }>(sql`select
      ${balanceOf(id)} as balance,
      ${overdueOf(id)} as has_overdue_debt,
      ${overdueAmountOf(id)} as overdue_amount,
      coalesce((select sum(s.amount) from subscriptions s where s.client_id = ${id} and s.active), 0) as monthly_subscriptions,
      (select count(*) from projects p where p.client_id = ${id} and p.archived_at is null
         and p.status in ('nuevo', 'en_curso', 'en_riesgo', 'pausado')) as active_projects,
      (select count(*) from tickets t where t.client_id = ${id} and t.${OPEN_TICKET} and ${LIVE_TICKET}) as open_tickets,
      ${lastContactOf(id)} as last_contact_at`),
  ]);

  return {
    id: client.id,
    name: client.name,
    legalName: client.legalName,
    taxId: client.taxId,
    taxCondition: client.taxCondition,
    address: client.address,
    phone: client.phone,
    email: client.email,
    status: client.status,
    priority: client.priority,
    source: client.source,
    statusReason: client.statusReason,
    createdAt: client.createdAt.toISOString(),
    contacts,
    billingProfile: billing ?? null,
    summary: {
      balance: toNumber(summary?.balance),
      hasOverdueDebt: summary?.has_overdue_debt ?? false,
      overdueAmount: toNumber(summary?.overdue_amount),
      monthlySubscriptions: toNumber(summary?.monthly_subscriptions),
      activeProjects: toNumber(summary?.active_projects),
      openTickets: toNumber(summary?.open_tickets),
      lastContactAt: summary?.last_contact_at ? toIso(summary.last_contact_at) : null,
    },
  };
}

// ─── Actividad ──────────────────────────────────────────────────────────────

const activityCursor = z.object({ t: z.iso.datetime(), i: z.uuid() });

export async function listActivities(
  db: DbOrTx,
  clientId: string,
  { cursor, limit }: { cursor?: string | undefined; limit: number },
) {
  const after = decodeCursor(cursor, activityCursor);
  const rows = await db
    .select({
      id: activities.id,
      kind: activities.kind,
      title: activities.title,
      body: activities.body,
      actorName: users.name,
      occurredAt: activities.occurredAt,
    })
    .from(activities)
    .leftJoin(users, eq(users.id, activities.actorId))
    .where(
      and(
        eq(activities.clientId, clientId),
        after ? sql`(${activities.occurredAt}, ${activities.id}) < (${after.t}, ${after.i})` : undefined,
      ),
    )
    .orderBy(desc(activities.occurredAt), desc(activities.id))
    .limit(limit + 1);

  const page = toPage(rows, limit, (last) => ({ t: last.occurredAt.toISOString(), i: last.id }));
  return {
    nextCursor: page.nextCursor,
    items: page.items.map(
      (r): ActivityDto => ({ ...r, occurredAt: r.occurredAt.toISOString() }),
    ),
  };
}

// ─── Pestañas de solo lectura (se completan en sus pasos) ───────────────────

export async function listClientTasks(db: DbOrTx, clientId: string): Promise<ClientTaskDto[]> {
  const rows = await db.execute<{
    id: string;
    title: string;
    status: TaskStatus;
    type_name: string;
    type_color: string;
    assignee_name: string;
    starts_at: Date | null;
  }>(sql`
    select t.id, t.title, t.status, tt.name as type_name, tt.color as type_color,
           u.name as assignee_name, t.starts_at
    from tasks t
    join task_types tt on tt.id = t.type_id
    join users u on u.id = t.assignee_id
    where t.client_id = ${clientId} and t.archived_at is null
    order by (t.status = 'hecha'), t.starts_at nulls last
    limit 100`);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    typeName: r.type_name,
    typeColor: r.type_color,
    assigneeName: r.assignee_name,
    startsAt: r.starts_at ? toIso(r.starts_at) : null,
  }));
}

const DEBIT_KINDS = new Set(["factura", "nota_debito"]);

function formatDocNumber(letter: string | null, pos: number, num: number): string {
  const body = `${String(pos).padStart(4, "0")}-${String(num).padStart(8, "0")}`;
  return letter ? `${letter} ${body}` : body;
}

export async function getStatement(
  db: DbOrTx,
  clientId: string,
  range: { from?: string | undefined; to?: string | undefined },
): Promise<StatementDto> {
  const signed = sql`case when d.kind in ('factura', 'nota_debito') then d.amount else -d.amount end`;

  const [opening] = range.from
    ? await db.execute<{ total: string }>(sql`
        select coalesce(sum(${signed}), 0) as total from documents d
        where d.client_id = ${clientId} and d.status = 'emitido' and d.issued_on < ${range.from}`)
    : [{ total: "0" }];

  const rows = await db.execute<{
    id: string;
    kind: StatementRow["kind"];
    letter: string | null;
    point_of_sale: number;
    number: number;
    issued_on: string;
    due_on: string | null;
    concept: string;
    amount: string;
    allocated: string;
  }>(sql`
    select d.id, d.kind, d.letter, d.point_of_sale, d.number, d.issued_on, d.due_on, d.concept,
           d.amount,
           coalesce((select sum(a.amount) from document_allocations a where a.target_id = d.id), 0) as allocated
    from documents d
    where d.client_id = ${clientId} and d.status = 'emitido'
      ${range.from ? sql`and d.issued_on >= ${range.from}` : sql``}
      ${range.to ? sql`and d.issued_on <= ${range.to}` : sql``}
    order by d.issued_on, d.created_at`);

  const openingBalance = toNumber(opening?.total);
  let balance = openingBalance;
  let totalDebit = 0;
  let totalCredit = 0;

  const statementRows = rows.map((r): StatementRow => {
    const amount = toNumber(r.amount);
    const isDebit = DEBIT_KINDS.has(r.kind);
    const debit = isDebit ? amount : 0;
    const credit = isDebit ? 0 : amount;
    totalDebit += debit;
    totalCredit += credit;
    balance += debit - credit;
    return {
      id: r.id,
      issuedOn: r.issued_on,
      kind: r.kind,
      number: formatDocNumber(r.letter, r.point_of_sale, r.number),
      concept: r.concept,
      debit,
      credit,
      balance,
      pendingAmount: isDebit ? Math.max(0, amount - toNumber(r.allocated)) : 0,
      dueOn: r.due_on,
    };
  });

  return {
    from: range.from ?? null,
    to: range.to ?? null,
    openingBalance,
    totalDebit,
    totalCredit,
    closingBalance: balance,
    rows: statementRows,
  };
}

export async function listClientProjects(db: DbOrTx, clientId: string): Promise<ClientProjectDto[]> {
  const rows = await db.execute<{
    id: string;
    name: string;
    status: ProjectStatus;
    phase: ProjectPhase;
    starts_on: string | null;
    due_on: string | null;
    due_is_estimate: boolean;
    open_tickets: string;
    overdue_tickets: string;
    resolved_tickets: string;
    archived_at: Date | null;
  }>(sql`
    select p.id, p.name, p.status, p.phase, p.starts_on, p.due_on, p.due_is_estimate, p.archived_at,
      (select count(*) from tickets t where t.project_id = p.id and t.archived_at is null and t.${OPEN_TICKET}) as open_tickets,
      (select count(*) from tickets t where t.project_id = p.id and t.archived_at is null and t.${OPEN_TICKET} and t.due_at < now()) as overdue_tickets,
      (select count(*) from tickets t where t.project_id = p.id and t.archived_at is null and t.status = 'resuelto') as resolved_tickets
    from projects p
    where p.client_id = ${clientId}
    order by (p.archived_at is not null), (p.status in ('entregado', 'cancelado')), p.created_at desc`);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    startsOn: r.starts_on,
    dueOn: r.due_on,
    dueIsEstimate: r.due_is_estimate,
    openTickets: toNumber(r.open_tickets),
    overdueTickets: toNumber(r.overdue_tickets),
    resolvedTickets: toNumber(r.resolved_tickets),
    progress: progressOf(r.status, r.phase),
    archivedAt: r.archived_at ? toIso(r.archived_at) : null,
  }));
}

/** Id y nombre de los clientes vigentes, para selectores (tareas, tickets…). */
export async function listClientOptions(db: DbOrTx): Promise<{ id: string; name: string }[]> {
  const rows = await db.execute<{ id: string; name: string }>(sql`
    select id, name from clients where status <> 'baja' order by name limit 2000`);
  return rows.map((r) => ({ id: r.id, name: r.name }));
}
