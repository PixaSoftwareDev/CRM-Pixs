/**
 * Lo que hace cada regla programada. Todas son idempotentes: correrlas dos
 * veces el mismo día no duplica nada (cada una se fija qué ya existe).
 * Devuelven las entidades afectadas, para el registro de ejecuciones.
 */
import { activities, type Db, eq, inArray, installments, projects, sql, taskComments, tasks } from "@crm/db";
import { nextWorkdayAt, todayArIso } from "../../lib/dates";
import { todayAr } from "../../lib/sql";
import { CLIENT_CREDIT } from "../finance/repository";
import { runAccrual } from "../finance/service";
import { listTaskTypes } from "../tasks/repository";

export interface Affected {
  entityType: string;
  entityId: string;
}

const pesos = (cents: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(cents / 100);

async function typeId(db: Db, name: string) {
  const t = (await listTaskTypes(db)).find((x) => x.name === name);
  if (!t) throw new Error(`Falta el tipo de tarea ${name}`);
  return t.id;
}

/** Responsable por defecto si el cliente no tiene dueño: el primer admin activo. */
async function fallbackUser(db: Db) {
  const [row] = await db.execute<{ id: string }>(sql`
    select id from users where active order by (role = 'admin') desc, created_at limit 1`);
  if (!row) throw new Error("No hay usuarios activos");
  return row.id;
}

/** Día 1 → facturas de los abonos del mes (el devengamiento ya es idempotente). */
export async function accrueSubscriptions(db: Db): Promise<Affected[]> {
  const res = await runAccrual(db, null, { month: todayArIso().slice(0, 7) });
  return res.created.map((c) => ({ entityType: "factura", entityId: `${c.client} · ${c.concept}` }));
}

/**
 * Cuotas y facturas que vencen en 3 días o ya vencieron → una tarea de
 * cobranza por cliente, si no tiene ya una abierta.
 */
export async function collectionTasks(db: Db): Promise<Affected[]> {
  const due = await db.execute<{ client_id: string; client_name: string; owner_id: string | null; items: string; total: string; installment_ids: string[]; credit: string }>(sql`
    with pend as (
      select d.client_id, d.concept, d.due_on,
             d.amount - coalesce((select sum(a.amount) from document_allocations a where a.target_id = d.id), 0) as amount,
             null::uuid as installment_id
      from documents d
      where d.kind in ('factura', 'nota_debito') and d.status = 'emitido'
      union all
      select pl.client_id, 'Cuota ' || i.number, i.due_on, i.amount, i.id
      from installments i join installment_plans pl on pl.id = i.plan_id
      where i.invoice_id is null and i.auto_reminder
    )
    select c.id as client_id, c.name as client_name, c.owner_id,
           string_agg(p.concept || ' (' || to_char(p.due_on, 'DD/MM') || ')', ', ' order by p.due_on) as items,
           sum(p.amount) as total,
           array_remove(array_agg(p.installment_id), null) as installment_ids,
           coalesce(cr.credit, 0) as credit
    from pend p join clients c on c.id = p.client_id
    left join ${CLIENT_CREDIT} cr on cr.client_id = c.id
    where p.amount > 0 and p.due_on <= ${todayAr} + 3
      and not exists (
        select 1 from tasks t join task_types tt on tt.id = t.type_id
        where t.client_id = c.id and tt.name = 'Cobranza' and t.status not in ('hecha', 'cancelada')
      )
    group by c.id, cr.credit
    -- Si el saldo a favor cubre lo que vence, no hay nada que cobrar.
    having sum(p.amount) > coalesce(cr.credit, 0)`);
  if (!due.length) return [];

  const type = await typeId(db, "Cobranza");
  const fallback = await fallbackUser(db);
  const at = nextWorkdayAt("10:00");
  return db.transaction(async (tx) => {
    const out: Affected[] = [];
    for (const d of due) {
      const [task] = await tx
        .insert(tasks)
        .values({
          title: `Cobrar a ${d.client_name}: ${pesos(Number(d.total) - Number(d.credit ?? 0))}`,
          typeId: type,
          clientId: d.client_id,
          assigneeId: d.owner_id ?? fallback,
          startsAt: at,
          durationMinutes: 30,
        })
        .returning({ id: tasks.id });
      if (!task) continue;
      await tx.insert(taskComments).values({ taskId: task.id, body: `Pendiente: ${d.items}.` });
      if (d.installment_ids.length) {
        await tx.update(installments).set({ lastReminderAt: new Date() }).where(inArray(installments.id, d.installment_ids));
      }
      out.push({ entityType: "tarea", entityId: task.id });
    }
    return out;
  });
}

/** Clientes activos sin llamada, reunión, WhatsApp ni mail hace 30 días → tarea de llamada. */
export async function noContactTasks(db: Db): Promise<Affected[]> {
  const rows = await db.execute<{ id: string; name: string; owner_id: string | null; last: string | null }>(sql`
    select c.id, c.name, c.owner_id,
           (select max(a.occurred_at)::date::text from activities a
             where a.client_id = c.id and a.kind in ('llamada', 'reunion', 'whatsapp', 'email')) as last
    from clients c
    where c.status in ('activo', 'en_riesgo')
      and c.created_at < now() - interval '30 days'
      and not exists (
        select 1 from activities a where a.client_id = c.id
          and a.kind in ('llamada', 'reunion', 'whatsapp', 'email') and a.occurred_at > now() - interval '30 days')
      and not exists (select 1 from tasks t where t.client_id = c.id and t.status not in ('hecha', 'cancelada'))`);
  if (!rows.length) return [];
  const type = await typeId(db, "Llamada");
  const fallback = await fallbackUser(db);
  const at = nextWorkdayAt("10:00");
  const created = await db
    .insert(tasks)
    .values(
      rows.map((c) => ({
        title: `Llamar a ${c.name}: ${c.last ? "30 días sin contacto" : "nunca hubo contacto registrado"}`,
        typeId: type,
        clientId: c.id,
        assigneeId: c.owner_id ?? fallback,
        startsAt: at,
        durationMinutes: 30,
      })),
    )
    .returning({ id: tasks.id });
  return created.map((t) => ({ entityType: "tarea", entityId: t.id }));
}

/** Proyectos que pasaron sus horas estimadas → en riesgo + tarea para el implementador. */
export async function overBudgetProjects(db: Db): Promise<Affected[]> {
  const rows = await db.execute<{ id: string; name: string; client_id: string; implementer_id: string | null; used: string; est: number }>(sql`
    select p.id, p.name, p.client_id, p.implementer_id, p.estimated_hours as est,
           (select coalesce(sum(minutes), 0) from time_entries te where te.project_id = p.id) / 60.0 as used
    from projects p
    where p.status in ('nuevo', 'en_curso') and p.estimated_hours is not null
      and (select coalesce(sum(minutes), 0) from time_entries te where te.project_id = p.id) > p.estimated_hours * 60`);
  if (!rows.length) return [];
  const type = await typeId(db, "Implementación");
  const fallback = await fallbackUser(db);
  return db.transaction(async (tx) => {
    for (const p of rows) {
      const used = Math.round(Number(p.used));
      await tx.update(projects).set({ status: "en_riesgo", updatedAt: new Date() }).where(eq(projects.id, p.id));
      await tx.insert(activities).values({
        clientId: p.client_id,
        projectId: p.id,
        kind: "sistema",
        title: `${p.name} pasó a En riesgo`,
        body: `Lleva ${used} h de ${p.est} h estimadas.`,
      });
      await tx.insert(tasks).values({
        title: `Revisar horas de ${p.name} (${used} h de ${p.est} h)`,
        typeId: type,
        clientId: p.client_id,
        projectId: p.id,
        assigneeId: p.implementer_id ?? fallback,
        startsAt: nextWorkdayAt("09:00"),
        durationMinutes: 30,
      });
    }
    return rows.map((p) => ({ entityType: "proyecto", entityId: p.id }));
  });
}

/** Mantenimiento (no es una regla): archiva las tareas hechas hace más de 14 días. */
export async function archiveDoneTasks(db: Db): Promise<number> {
  const res = await db.execute(sql`
    update tasks set archived_at = now()
    where status in ('hecha', 'cancelada') and archived_at is null
      and coalesce(completed_at, updated_at) < now() - interval '14 days'`);
  return res.count ?? 0;
}
