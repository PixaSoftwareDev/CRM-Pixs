/** Lecturas del Embudo. */
import { type DbOrTx, sql } from "@crm/db";
import type { OpportunityCardDto, OpportunityStatus, PipelineDto, StageKey, TaskStatus } from "@crm/shared";
import { todayAr, toIso, toNumber } from "../../lib/sql";

/** Inicio del mes en curso en Argentina. */
const MONTH_START = sql`(date_trunc('month', ${todayAr})::timestamp at time zone 'America/Argentina/Buenos_Aires')`;
const TODAY_START = sql`(${todayAr}::timestamp at time zone 'America/Argentina/Buenos_Aires')`;

/**
 * En las etapas abiertas cuentan las oportunidades abiertas; en la de cierre
 * ganado (Implementación), las que se ganaron este mes.
 */
const IN_STAGE = sql`(
  (s.closes_as is null and o.status = 'abierta')
  or (s.closes_as = 'ganada' and o.status = 'ganada' and o.closed_at >= ${MONTH_START})
)`;

/**
 * Tareas de la oportunidad `o`: las suyas y las del cliente sin oportunidad.
 * Una tarea de otra oportunidad del mismo cliente no es de esta. Mismo criterio
 * para la tarea que muestra la tarjeta y para el contador de la etapa.
 */
const TASK_OF_OPP = sql`(t.opportunity_id = o.id or (t.opportunity_id is null and t.client_id = o.client_id))`;
/** Tarea abierta (lo que cuenta el resumen por etapa). */
const OPEN_TASK = sql`(t.status not in ('hecha', 'cancelada') and t.archived_at is null)`;

export async function getPipeline(db: DbOrTx): Promise<PipelineDto> {
  const [stages, moves] = await Promise.all([
    db.execute<{
      id: string;
      key: StageKey;
      name: string;
      description: string | null;
      color: string;
      n: string;
      total: string;
      open_tasks: string;
    }>(sql`
      select s.id, s.key, s.name, s.description, s.color,
             count(o.id) as n, coalesce(sum(o.amount), 0) as total,
             -- Cada tarea una sola vez, aunque sea del cliente y este tenga varias oportunidades en la etapa.
             (select count(*) from tasks t
               where ${OPEN_TASK}
                 and exists (select 1 from opportunities o where o.stage_id = s.id and ${IN_STAGE} and ${TASK_OF_OPP})
             ) as open_tasks
      from pipeline_stages s
      left join opportunities o on o.stage_id = s.id and ${IN_STAGE}
      group by s.id
      order by s.position`),
    db.execute<{
      created_at: Date;
      opportunity_id: string;
      client_name: string;
      stage_name: string;
      reason: string | null;
      actor_name: string | null;
    }>(sql`
      select c.created_at, c.opportunity_id, cl.name as client_name, s.name as stage_name, c.reason, u.name as actor_name
      from opportunity_stage_changes c
      join opportunities o on o.id = c.opportunity_id
      join clients cl on cl.id = o.client_id
      join pipeline_stages s on s.id = c.to_stage_id
      left join users u on u.id = c.changed_by_id
      where c.created_at >= ${TODAY_START}
      order by c.created_at desc
      limit 50`),
  ]);

  const dto = stages.map((s) => ({
    id: s.id,
    key: s.key,
    name: s.name,
    description: s.description,
    color: s.color,
    count: toNumber(s.n),
    total: toNumber(s.total),
    openTasks: toNumber(s.open_tasks),
  }));
  const open = dto.filter((s) => s.key !== "implementacion");
  return {
    stages: dto,
    openCount: open.reduce((a, s) => a + s.count, 0),
    openTotal: open.reduce((a, s) => a + s.total, 0),
    wonThisMonth: dto.find((s) => s.key === "implementacion")?.total ?? 0,
    todayMoves: moves.map((m) => ({
      at: toIso(m.created_at),
      opportunityId: m.opportunity_id,
      clientName: m.client_name,
      stageName: m.stage_name,
      reason: m.reason,
      actorName: m.actor_name,
    })),
  };
}

export async function listStageOpportunities(db: DbOrTx, stageId: string): Promise<OpportunityCardDto[]> {
  const rows = await db.execute<{
    id: string;
    title: string;
    amount: string;
    status: OpportunityStatus;
    client_id: string;
    client_name: string;
    contact_name: string | null;
    contact_job: string | null;
    owner_id: string | null;
    owner_name: string | null;
    stage_entered_at: Date;
    days: number;
    project_id: string | null;
    task: {
      id: string;
      title: string;
      status: TaskStatus;
      type_name: string;
      type_color: string;
      assignee_name: string;
      starts_at: string | null;
    } | null;
  }>(sql`
    select o.id, o.title, o.amount, o.status, cl.id as client_id, cl.name as client_name,
           coalesce(ct.name, mc.name) as contact_name, coalesce(ct.job_title, mc.job_title) as contact_job,
           u.id as owner_id, u.name as owner_name, o.stage_entered_at,
           (${todayAr} - (o.stage_entered_at at time zone 'America/Argentina/Buenos_Aires')::date) as days,
           p.id as project_id,
           nt.task
    from opportunities o
    join pipeline_stages s on s.id = o.stage_id
    join clients cl on cl.id = o.client_id
    left join client_contacts ct on ct.id = o.contact_id
    left join lateral (
      select name, job_title from client_contacts where client_id = cl.id
      order by is_decision_maker desc, created_at limit 1
    ) mc on true
    left join users u on u.id = o.owner_id
    left join projects p on p.opportunity_id = o.id
    -- Próxima tarea abierta (de la oportunidad o del cliente); si no hay, la última hecha.
    left join lateral (
      select json_build_object(
        'id', t.id, 'title', t.title, 'status', t.status, 'type_name', tt.name, 'type_color', tt.color,
        'assignee_name', a.name, 'starts_at', t.starts_at) as task
      from tasks t
      join task_types tt on tt.id = t.type_id
      join users a on a.id = t.assignee_id
      where ${TASK_OF_OPP} and t.archived_at is null and t.status <> 'cancelada'
      order by (t.status = 'hecha'), case when t.status = 'hecha' then null else t.starts_at end nulls last,
               t.completed_at desc nulls last
      limit 1
    ) nt on true
    where o.stage_id = ${stageId} and ${IN_STAGE}
    order by o.stage_entered_at
    limit 500`);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    amount: toNumber(r.amount),
    status: r.status,
    client: { id: r.client_id, name: r.client_name },
    contact: r.contact_name ? { name: r.contact_name, jobTitle: r.contact_job } : null,
    owner: r.owner_id && r.owner_name ? { id: r.owner_id, name: r.owner_name } : null,
    stageEnteredAt: toIso(r.stage_entered_at),
    daysInStage: toNumber(r.days),
    projectId: r.project_id,
    nextTask: r.task
      ? {
          id: r.task.id,
          title: r.task.title,
          status: r.task.status,
          typeName: r.task.type_name,
          typeColor: r.task.type_color,
          assigneeName: r.task.assignee_name,
          startsAt: r.task.starts_at ? toIso(r.task.starts_at) : null,
        }
      : null,
  }));
}

export async function findOpportunity(db: DbOrTx, id: string) {
  const [row] = await db.execute<{
    id: string;
    client_id: string;
    contact_id: string | null;
    title: string;
    amount: string;
    status: OpportunityStatus;
    stage_id: string;
    owner_id: string | null;
    client_status: string;
  }>(sql`
    select o.id, o.client_id, o.contact_id, o.title, o.amount, o.status, o.stage_id, o.owner_id, c.status as client_status
    from opportunities o join clients c on c.id = o.client_id
    where o.id = ${id}`);
  return row ? { ...row, amount: toNumber(row.amount) } : null;
}

export async function findStage(db: DbOrTx, id: string) {
  const [row] = await db.execute<{ id: string; key: StageKey; name: string; closes_as: string | null }>(
    sql`select id, key, name, closes_as from pipeline_stages where id = ${id}`,
  );
  return row ?? null;
}
