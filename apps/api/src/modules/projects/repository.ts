/**
 * Lecturas de Proyectos. Los contadores (tickets, tareas, horas) salen de
 * subconsultas indexadas por project_id; la salud se calcula en `healthOf`.
 */
import { type DbOrTx, sql } from "@crm/db";
import {
  PROJECT_PHASES,
  type ProjectDetail,
  type ProjectHealth,
  type ProjectListItem,
  type ProjectPhase,
  type ProjectStatus,
  type ProjectTicketDto,
} from "@crm/shared";
import { todayAr, toIso, toNumber } from "../../lib/sql";
import { listTasksOfProject } from "../tasks/repository";

interface Row extends Record<string, unknown> {
  id: string;
  name: string;
  client_id: string;
  client_name: string;
  implementer_id: string | null;
  implementer_name: string | null;
  status: ProjectStatus;
  phase: ProjectPhase;
  created_automatically: boolean;
  starts_on: string | null;
  due_on: string | null;
  due_is_estimate: boolean;
  estimated_hours: number | null;
  created_at: Date;
  archived_at: Date | null;
  pending_tickets: string;
  resolved_tickets: string;
  overdue_tickets: string;
  open_tasks: string;
  minutes_used: string;
  overdue_due: boolean;
}

const OPEN = sql`status not in ('resuelto', 'cancelado')`;
/** Los tickets dados de baja no cuentan ni se listan. */
const LIVE = sql`archived_at is null`;

const SELECT = sql`
  select p.id, p.name, c.id as client_id, c.name as client_name,
         u.id as implementer_id, u.name as implementer_name,
         p.status, p.phase, p.created_automatically, p.starts_on, p.due_on, p.due_is_estimate,
         p.estimated_hours, p.created_at, p.archived_at,
         (select count(*) from tickets t where t.project_id = p.id and t.${LIVE} and t.${OPEN}) as pending_tickets,
         (select count(*) from tickets t where t.project_id = p.id and t.${LIVE} and t.status = 'resuelto') as resolved_tickets,
         (select count(*) from tickets t where t.project_id = p.id and t.${LIVE} and t.${OPEN} and t.due_at < now()) as overdue_tickets,
         (select count(*) from tasks t where t.project_id = p.id and t.status not in ('hecha', 'cancelada') and t.archived_at is null) as open_tasks,
         (select coalesce(sum(minutes), 0) from time_entries te where te.project_id = p.id) as minutes_used,
         (p.due_on is not null and p.due_on < ${todayAr}) as overdue_due
  from projects p
  join clients c on c.id = p.client_id
  left join users u on u.id = p.implementer_id`;

/**
 * Lo que se muestra como estado. Un proyecto "en curso" pasa a "en riesgo" solo
 * si hay señales objetivas: más de un ticket vencido, horas por encima de lo
 * estimado o la entrega ya pasó.
 */
export function healthOf(p: {
  status: ProjectStatus;
  phase: ProjectPhase;
  overdueTickets: number;
  hoursUsed: number;
  estimatedHours: number | null;
  overdueDue: boolean;
}): ProjectHealth {
  if (p.status === "entregado") return "terminado";
  if (p.status === "cancelado" || p.status === "pausado") return p.status;
  const hoursOver = p.estimatedHours !== null && p.hoursUsed > p.estimatedHours;
  if (p.status === "en_riesgo" || p.overdueTickets > 1 || hoursOver || p.overdueDue) return "en_riesgo";
  if (p.status === "nuevo" && p.phase === "kickoff") return "nuevo";
  return "en_curso";
}

/** Avance = etapas cumplidas sobre el total (entregado = 100 %). */
export const progressOf = (status: ProjectStatus, phase: ProjectPhase) =>
  status === "entregado" ? 100 : Math.round((PROJECT_PHASES.indexOf(phase) / PROJECT_PHASES.length) * 100);

function toItem(r: Row): ProjectListItem {
  const base = {
    status: r.status,
    phase: r.phase,
    overdueTickets: toNumber(r.overdue_tickets),
    hoursUsed: Math.round((toNumber(r.minutes_used) / 60) * 10) / 10,
    estimatedHours: r.estimated_hours,
  };
  return {
    id: r.id,
    name: r.name,
    client: { id: r.client_id, name: r.client_name },
    implementer: r.implementer_id && r.implementer_name ? { id: r.implementer_id, name: r.implementer_name } : null,
    ...base,
    health: healthOf({ ...base, overdueDue: r.overdue_due }),
    progress: progressOf(r.status, r.phase),
    createdAutomatically: r.created_automatically,
    startsOn: r.starts_on,
    dueOn: r.due_on,
    dueIsEstimate: r.due_is_estimate,
    pendingTickets: toNumber(r.pending_tickets),
    resolvedTickets: toNumber(r.resolved_tickets),
    openTasks: toNumber(r.open_tasks),
    createdAt: toIso(r.created_at),
    archivedAt: r.archived_at ? toIso(r.archived_at) : null,
  };
}

/**
 * Todos los proyectos (una agencia tiene decenas, no miles): se filtran en el front.
 * Por defecto solo los activos; con `archived` solo los dados de baja.
 */
export async function listProjects(db: DbOrTx, { archived = false }: { archived?: boolean } = {}): Promise<ProjectListItem[]> {
  const rows = await db.execute<Row>(sql`
    ${SELECT}
    where ${archived ? sql`p.archived_at is not null` : sql`p.archived_at is null`}
    order by (p.status in ('entregado', 'cancelado')), p.created_at desc
    limit 1000`);
  return rows.map(toItem);
}

export async function getProjectDetail(db: DbOrTx, id: string): Promise<ProjectDetail | null> {
  const [row] = await db.execute<
    Row & {
      scope: string | null;
      sale_amount: string | null;
      payment_terms: string | null;
      seller_id: string | null;
      seller_name: string | null;
      sold_on: string | null;
      opportunity_id: string | null;
    }
  >(sql`
    select base.*, p.scope, p.sale_amount, p.payment_terms, p.sold_on, p.opportunity_id,
           s.id as seller_id, s.name as seller_name
    from (${SELECT} where p.id = ${id}) base
    join projects p on p.id = base.id
    left join users s on s.id = p.seller_id`);
  if (!row) return null;

  const [contact, tickets, tasks] = await Promise.all([
    db.execute<{ name: string; job_title: string | null; phone: string | null; email: string | null }>(sql`
      select ct.name, ct.job_title, ct.phone, ct.email
      from client_contacts ct
      left join opportunities o on o.id = ${row.opportunity_id}
      where ct.client_id = ${row.client_id}
      order by (ct.id = o.contact_id) desc nulls last, ct.is_decision_maker desc, ct.created_at
      limit 1`),
    db.execute<{
      id: string;
      number: number;
      title: string;
      type: string;
      status: string;
      due_at: Date | null;
      overdue: boolean;
      assignee_name: string | null;
    }>(sql`
      select t.id, t.number, t.title, t.type, t.status, t.due_at,
             (t.${OPEN} and t.due_at < now()) as overdue, u.name as assignee_name
      from tickets t left join users u on u.id = t.assignee_id
      where t.project_id = ${id} and t.${LIVE}
      order by (t.status in ('resuelto', 'cancelado')), t.due_at nulls last
      limit 200`),
    listTasksOfProject(db, id),
  ]);

  const c = contact[0];
  return {
    ...toItem(row),
    scope: row.scope,
    sale: {
      amount: row.sale_amount === null ? null : toNumber(row.sale_amount),
      paymentTerms: row.payment_terms,
      seller: row.seller_id && row.seller_name ? { id: row.seller_id, name: row.seller_name } : null,
      soldOn: row.sold_on,
    },
    opportunityId: row.opportunity_id,
    contact: c ? { name: c.name, jobTitle: c.job_title, phone: c.phone, email: c.email } : null,
    tickets: tickets.map(
      (t): ProjectTicketDto => ({
        id: t.id,
        number: t.number,
        title: t.title,
        type: t.type,
        status: t.status,
        dueAt: t.due_at ? toIso(t.due_at) : null,
        overdue: t.overdue,
        assigneeName: t.assignee_name,
      }),
    ),
    tasks,
  };
}
