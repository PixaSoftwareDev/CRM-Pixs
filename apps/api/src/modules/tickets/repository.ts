/**
 * Lecturas de Tickets. El buscador filtra en la base (los tickets crecen sin
 * techo) y pagina por número descendente (keyset: igual de rápido en la página 50).
 */
import { and, type DbOrTx, type SQL, sql } from "@pixs/db";
import type { ticketListQuery } from "@pixs/shared";
import type {
  Page,
  TicketChannel,
  TicketDetail,
  TicketListItem,
  TicketPriority,
  TicketStatus,
  TicketType,
} from "@pixs/shared";
import { z } from "zod";
import { decodeCursor, likePattern, toPage } from "../../lib/cursor";
import { toIso } from "../../lib/sql";
import { listTasksOfTicket } from "../tasks/repository";

const AR = "America/Argentina/Buenos_Aires";
/** Día de Argentina de un timestamptz. */
const arDay = (col: SQL) => sql`(${col} at time zone ${AR})::date`;
const OPEN = sql`t.status not in ('resuelto', 'cancelado')`;

export interface Row extends Record<string, unknown> {
  id: string;
  number: number;
  title: string;
  type: TicketType;
  priority: TicketPriority;
  status: TicketStatus;
  channel: TicketChannel;
  client_id: string;
  client_name: string;
  received_at: Date;
  reporter_id: string | null;
  reporter_name: string | null;
  due_at: Date | null;
  assignee_id: string | null;
  assignee_name: string | null;
  resolved_at: Date | null;
  overdue: boolean;
}

const SELECT = sql`
  select t.id, t.number, t.title, t.type, t.priority, t.status, t.channel,
         c.id as client_id, c.name as client_name, t.received_at,
         r.id as reporter_id, r.name as reporter_name, t.due_at,
         a.id as assignee_id, a.name as assignee_name, t.resolved_at,
         (${OPEN} and t.due_at < now()) as overdue
  from tickets t
  join clients c on c.id = t.client_id
  left join users r on r.id = t.reported_by_id
  left join users a on a.id = t.assignee_id`;

const ref = (id: string | null, name: string | null) => (id && name ? { id, name } : null);

function toItem(r: Row): TicketListItem {
  return {
    id: r.id,
    number: r.number,
    title: r.title,
    type: r.type,
    priority: r.priority,
    status: r.status,
    channel: r.channel,
    client: { id: r.client_id, name: r.client_name },
    receivedAt: toIso(r.received_at),
    reportedBy: ref(r.reporter_id, r.reporter_name),
    dueAt: r.due_at ? toIso(r.due_at) : null,
    assignee: ref(r.assignee_id, r.assignee_name),
    resolvedAt: r.resolved_at ? toIso(r.resolved_at) : null,
    overdue: r.overdue,
  };
}

const cursorSchema = z.number().int();

export async function listTickets(db: DbOrTx, q: z.output<typeof ticketListQuery>): Promise<Page<TicketListItem>> {
  const after = decodeCursor(q.cursor, cursorSchema);
  const where = and(
    q.number ? sql`t.number = ${q.number}` : undefined,
    q.clientId ? sql`t.client_id = ${q.clientId}` : undefined,
    q.type ? sql`t.type = ${q.type}` : undefined,
    q.priority ? sql`t.priority = ${q.priority}` : undefined,
    q.status ? sql`t.status = ${q.status}` : undefined,
    q.open ? OPEN : undefined,
    q.receivedOn ? sql`${arDay(sql`t.received_at`)} = ${q.receivedOn}` : undefined,
    q.dueOn ? sql`${arDay(sql`t.due_at`)} = ${q.dueOn}` : undefined,
    q.resolvedOn ? sql`${arDay(sql`t.resolved_at`)} = ${q.resolvedOn}` : undefined,
    q.resolvedById ? sql`t.resolved_by_id = ${q.resolvedById}` : undefined,
    q.assigneeId ? sql`t.assignee_id = ${q.assigneeId}` : undefined,
    // Título por índice trigram; la descripción por ILIKE (es texto largo y menos buscado).
    q.q ? sql`(t.title ilike ${likePattern(q.q)} or t.description ilike ${likePattern(q.q)})` : undefined,
    after !== null ? sql`t.number < ${after}` : undefined,
  );
  const rows = await db.execute<Row>(sql`
    ${SELECT}
    ${where ? sql`where ${where}` : sql``}
    order by t.number desc
    limit ${q.limit + 1}`);
  const page = toPage(rows, q.limit, (last) => last.number);
  return { items: page.items.map(toItem), nextCursor: page.nextCursor };
}

export async function findTicket(db: DbOrTx, id: string) {
  const [row] = await db.execute<
    Row & {
      description: string | null;
      project_id: string | null;
      assignee_ref: string | null;
      confirmer_id: string | null;
      confirm_at: Date | null;
      scheduled_at: Date | null;
      resolved_by_id: string | null;
      resolution_note: string | null;
      suggested_assignee_id: string | null;
    }
  >(sql`
    select base.*, t.description, t.project_id, t.confirmer_id, t.confirm_at, t.scheduled_at,
           t.resolved_by_id, t.resolution_note, t.suggested_assignee_id
    from (${SELECT} where t.id = ${id}) base
    join tickets t on t.id = base.id`);
  return row ?? null;
}

/**
 * Sugerencia de quién lo hace: el implementador del proyecto; si no hay, quien
 * menos tickets abiertos tiene.
 */
async function suggestAssignee(db: DbOrTx, projectId: string | null) {
  const [row] = await db.execute<{ id: string; name: string }>(sql`
    select u.id, u.name from users u
    where u.active and (
      ${projectId}::uuid is null
      or u.id = (select implementer_id from projects where id = ${projectId})
    )
    order by (select count(*) from tickets t where t.assignee_id = u.id and ${OPEN}), u.name
    limit 1`);
  return row ?? null;
}

export async function getTicketDetail(db: DbOrTx, id: string): Promise<TicketDetail | null> {
  const r = await findTicket(db, id);
  if (!r) return null;

  const [extra, events, tasks, suggested] = await Promise.all([
    db.execute<{
      client_priority: string;
      project_name: string | null;
      contact_name: string | null;
      contact_phone: string | null;
      contact_email: string | null;
      confirmer_name: string | null;
      resolver_name: string | null;
    }>(sql`
      select c.priority as client_priority, p.name as project_name,
             ct.name as contact_name, coalesce(ct.phone, c.phone) as contact_phone, coalesce(ct.email, c.email) as contact_email,
             cu.name as confirmer_name, ru.name as resolver_name
      from clients c
      left join projects p on p.id = ${r.project_id}
      left join users cu on cu.id = ${r.confirmer_id}
      left join users ru on ru.id = ${r.resolved_by_id}
      -- Para un ticket, el contacto útil es quien maneja el soporte.
      left join lateral (
        select name, phone, email from client_contacts where client_id = c.id
        order by handles_support desc, is_decision_maker desc, created_at limit 1
      ) ct on true
      where c.id = ${r.client_id}`),
    db.execute<{ id: string; kind: string; message: string; actor_name: string | null; created_at: Date }>(sql`
      select e.id, e.kind, e.message, u.name as actor_name, e.created_at
      from ticket_events e left join users u on u.id = e.actor_id
      where e.ticket_id = ${id}
      order by e.created_at desc, e.id desc
      limit 200`),
    listTasksOfTicket(db, id),
    r.suggested_assignee_id
      ? db
          .execute<{ id: string; name: string }>(sql`select id, name from users where id = ${r.suggested_assignee_id}`)
          .then((x) => x[0] ?? null)
      : suggestAssignee(db, r.project_id),
  ]);
  const x = extra[0];

  return {
    ...toItem(r),
    description: r.description,
    project: ref(r.project_id, x?.project_name ?? null),
    clientPriority: x?.client_priority ?? "media",
    contact: x?.contact_name ? { name: x.contact_name, phone: x.contact_phone, email: x.contact_email } : null,
    suggestedAssignee: suggested,
    scheduledAt: r.scheduled_at ? toIso(r.scheduled_at) : null,
    confirmer: ref(r.confirmer_id, x?.confirmer_name ?? null),
    confirmAt: r.confirm_at ? toIso(r.confirm_at) : null,
    resolvedBy: ref(r.resolved_by_id, x?.resolver_name ?? null),
    resolutionNote: r.resolution_note,
    tasks,
    events: events.map((e) => ({
      id: e.id,
      kind: e.kind,
      message: e.message,
      actorName: e.actor_name,
      createdAt: toIso(e.created_at),
    })),
  };
}
