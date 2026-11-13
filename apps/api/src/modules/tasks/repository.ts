/**
 * Lecturas de Tareas. Una sola forma de fila (TASK_SELECT) alimenta la agenda,
 * "Mi día" y el detalle, así el front recibe siempre el mismo DTO.
 */
import { type DbOrTx, type SQL, sql } from "@pixs/db";
import type { TaskCommentDto, TaskDetailDto, TaskDto, TaskStatus, TaskTypeDto, TeamMember } from "@pixs/shared";
import { toIso, toNumber } from "../../lib/sql";

const AR_TZ = "America/Argentina/Buenos_Aires";

interface TaskRow extends Record<string, unknown> {
  id: string;
  title: string;
  status: TaskStatus;
  starts_at: Date | string | null;
  duration_minutes: number;
  completed_at: Date | string | null;
  type_id: string;
  type_name: string;
  type_color: string;
  client_id: string | null;
  client_name: string | null;
  assignee_id: string;
  assignee_name: string;
  assigned_by_id: string | null;
  assigned_by_name: string | null;
}

const TASK_SELECT = sql`
  select t.id, t.title, t.status, t.starts_at, t.duration_minutes, t.completed_at,
         tt.id as type_id, tt.name as type_name, tt.color as type_color,
         c.id as client_id, c.name as client_name,
         a.id as assignee_id, a.name as assignee_name,
         b.id as assigned_by_id, b.name as assigned_by_name
  from tasks t
  join task_types tt on tt.id = t.type_id
  join users a on a.id = t.assignee_id
  left join users b on b.id = t.assigned_by_id
  left join clients c on c.id = t.client_id`;

function toDto(r: TaskRow): TaskDto {
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    startsAt: r.starts_at ? toIso(r.starts_at) : null,
    durationMinutes: r.duration_minutes,
    completedAt: r.completed_at ? toIso(r.completed_at) : null,
    type: { id: r.type_id, name: r.type_name, color: r.type_color },
    client: r.client_id && r.client_name ? { id: r.client_id, name: r.client_name } : null,
    assignee: { id: r.assignee_id, name: r.assignee_name },
    assignedBy: r.assigned_by_id && r.assigned_by_name ? { id: r.assigned_by_id, name: r.assigned_by_name } : null,
  };
}

/** Medianoche de un día de Argentina como instante (usa el índice por starts_at). */
const arMidnight = (day: string | SQL) => sql`((${day})::date)::timestamp at time zone ${AR_TZ}`;

/**
 * Tareas agendadas entre dos días de Argentina (ambos inclusive), de todo el
 * equipo: el front filtra por persona y así cuenta las de cada uno sin otra consulta.
 * Las canceladas no ocupan lugar en la agenda.
 */
export async function listTasksInRange(db: DbOrTx, from: string, to: string): Promise<TaskDto[]> {
  const rows = await db.execute<TaskRow>(sql`
    ${TASK_SELECT}
    where t.archived_at is null
      and t.status <> 'cancelada'
      and t.starts_at >= ${arMidnight(from)}
      and t.starts_at < ${arMidnight(sql`${to}::date + 1`)}
    order by t.starts_at, t.duration_minutes desc
    limit 2000`);
  return rows.map(toDto);
}

export async function findTask(db: DbOrTx, id: string): Promise<TaskDto | null> {
  const [row] = await db.execute<TaskRow>(sql`${TASK_SELECT} where t.id = ${id}`);
  return row ? toDto(row) : null;
}

export async function getTaskDetail(db: DbOrTx, id: string): Promise<TaskDetailDto | null> {
  const task = await findTask(db, id);
  if (!task) return null;

  const [comments, contact] = await Promise.all([
    db.execute<{ id: string; body: string; author_name: string | null; created_at: Date }>(sql`
      select tc.id, tc.body, u.name as author_name, tc.created_at
      from task_comments tc
      left join users u on u.id = tc.author_id
      where tc.task_id = ${id}
      order by tc.created_at, tc.id`),
    task.client
      ? db.execute<{ name: string; phone: string | null; email: string | null }>(sql`
          select coalesce(cc.name, c.name) as name,
                 coalesce(cc.phone, c.phone) as phone,
                 coalesce(cc.email, c.email) as email
          from clients c
          left join lateral (
            select name, phone, email from client_contacts
            where client_id = c.id
            order by is_decision_maker desc, created_at
            limit 1
          ) cc on true
          where c.id = ${task.client.id}`)
      : Promise.resolve([]),
  ]);

  return {
    ...task,
    comments: comments.map(
      (c): TaskCommentDto => ({ id: c.id, body: c.body, authorName: c.author_name, createdAt: toIso(c.created_at) }),
    ),
    contact: contact[0] ?? null,
  };
}

export async function listTaskTypes(db: DbOrTx): Promise<TaskTypeDto[]> {
  const rows = await db.execute<{
    id: string;
    name: string;
    color: string;
    is_system: boolean;
    in_use: string;
  }>(sql`
    select tt.id, tt.name, tt.color, tt.is_system,
           (select count(*) from tasks t where t.type_id = tt.id) as in_use
    from task_types tt
    order by tt.position, tt.name`);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    isSystem: r.is_system,
    inUse: toNumber(r.in_use),
  }));
}

export async function listTeam(db: DbOrTx): Promise<TeamMember[]> {
  return db.execute<{ id: string; name: string; color: string | null }>(sql`
    select id, name, color from users where active order by name`).then((rows) =>
    rows.map((r) => ({ id: r.id, name: r.name, color: r.color })),
  );
}

export async function isActiveUser(db: DbOrTx, id: string): Promise<boolean> {
  const [row] = await db.execute(sql`select 1 from users where id = ${id} and active`);
  return !!row;
}

export async function existsIn(db: DbOrTx, table: "task_types" | "clients", id: string): Promise<boolean> {
  const [row] = await db.execute(sql`select 1 from ${sql.identifier(table)} where id = ${id}`);
  return !!row;
}

/** Tareas abiertas primero (por fecha), después las hechas más recientes. */
async function listTasksWhere(db: DbOrTx, where: SQL): Promise<TaskDto[]> {
  const rows = await db.execute<TaskRow>(sql`
    ${TASK_SELECT}
    where ${where} and t.archived_at is null and t.status <> 'cancelada'
    order by (t.status = 'hecha'), case when t.status = 'hecha' then null else t.starts_at end nulls last,
             t.completed_at desc nulls last
    limit 200`);
  return rows.map(toDto);
}

export const listTasksOfProject = (db: DbOrTx, projectId: string) => listTasksWhere(db, sql`t.project_id = ${projectId}`);
export const listTasksOfTicket = (db: DbOrTx, ticketId: string) => listTasksWhere(db, sql`t.ticket_id = ${ticketId}`);
