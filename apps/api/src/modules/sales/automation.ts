/**
 * El embudo "se gestiona solo": cada cliente avanza según lo que pasa con sus
 * tareas en Mi día. Las reglas solo mueven hacia adelante y nunca cierran una
 * venta (ganar pide datos: implementador, forma de pago… ver service.winOpportunity).
 *
 *   Llamada hecha                         → Primer contacto
 *   Reunión agendada o hecha              → Reunión
 *   Tarea de Ventas hecha                 → Propuesta comercial
 *     … con un comentario que dice "aceptó" → Cierre de venta
 *   Cualquier tarea en curso en Propuesta → Seguimiento
 */
import { type DbOrTx, eq, opportunities, opportunityStageChanges, sql } from "@crm/db";
import type { StageKey } from "@crm/shared";

export type TaskEvent = "scheduled" | "done" | "in_progress";

interface Rule {
  to: StageKey;
  reason: string;
  /** Solo aplica si la oportunidad está exactamente en esta etapa. */
  onlyFrom?: StageKey;
}

const ACCEPTED = /\bacept[oóa]/i;

export function ruleFor(event: TaskEvent, typeName: string, note: string | undefined): Rule | null {
  if (event === "in_progress") return { to: "seguimiento", reason: "tarea de seguimiento en curso", onlyFrom: "propuesta" };
  if (typeName === "Reunión") {
    return { to: "reunion", reason: event === "done" ? "reunión hecha" : "reunión agendada" };
  }
  if (event !== "done") return null;
  if (typeName === "Llamada") return { to: "primer_contacto", reason: "llamada marcada hecha" };
  if (typeName === "Ventas") {
    return note && ACCEPTED.test(note)
      ? { to: "cierre", reason: "el cliente aceptó (comentario en la tarea)" }
      : { to: "propuesta", reason: "propuesta enviada (tarea hecha)" };
  }
  return null;
}

interface OppRow extends Record<string, unknown> {
  id: string;
  stage_key: StageKey;
  stage_position: number;
}

/** La oportunidad abierta de la tarea (o la más reciente del cliente). */
async function openOpportunityFor(db: DbOrTx, taskId: string): Promise<OppRow | null> {
  const [row] = await db.execute<OppRow>(sql`
    select o.id, s.key as stage_key, s.position as stage_position
    from tasks t
    join opportunities o on o.status = 'abierta'
      and (o.id = t.opportunity_id or (t.opportunity_id is null and o.client_id = t.client_id))
    join pipeline_stages s on s.id = o.stage_id
    where t.id = ${taskId}
    order by (o.id = t.opportunity_id) desc nulls last, o.created_at desc
    limit 1`);
  return row ?? null;
}

async function stageByKey(db: DbOrTx, key: StageKey) {
  const [row] = await db.execute<{ id: string; position: number }>(
    sql`select id, position from pipeline_stages where key = ${key}`,
  );
  if (!row) throw new Error(`Falta la etapa ${key}: corré pnpm db:seed`);
  return row;
}

/** Mueve una oportunidad de etapa y deja el registro (lo usa también el movimiento manual). */
export async function moveToStage(
  db: DbOrTx,
  opp: { id: string; stageId?: string | null },
  toStageId: string,
  actorId: string | null,
  reason: string,
) {
  await db
    .update(opportunities)
    .set({ stageId: toStageId, stageEnteredAt: new Date(), updatedAt: new Date() })
    .where(eq(opportunities.id, opp.id));
  await db.insert(opportunityStageChanges).values({
    opportunityId: opp.id,
    fromStageId: opp.stageId ?? null,
    toStageId,
    changedById: actorId,
    reason,
  });
}

/**
 * Aplica la regla que corresponda a un evento de tarea. Corre dentro de la
 * transacción del cambio de la tarea: o pasan las dos cosas o ninguna.
 */
export async function advanceFromTask(
  db: DbOrTx,
  actorId: string,
  input: { taskId: string; typeName: string; event: TaskEvent; note?: string | undefined },
): Promise<void> {
  const rule = ruleFor(input.event, input.typeName, input.note);
  if (!rule) return;
  const opp = await openOpportunityFor(db, input.taskId);
  if (!opp) return;
  if (rule.onlyFrom && opp.stage_key !== rule.onlyFrom) return;
  const target = await stageByKey(db, rule.to);
  if (target.position <= opp.stage_position) return; // nunca para atrás

  const [current] = await db.execute<{ stage_id: string }>(sql`select stage_id from opportunities where id = ${opp.id}`);
  await moveToStage(db, { id: opp.id, stageId: current?.stage_id ?? null }, target.id, actorId, rule.reason);
}

/** Oportunidad abierta más reciente del cliente, para colgarle las tareas nuevas. */
export async function openOpportunityOfClient(db: DbOrTx, clientId: string): Promise<string | null> {
  const [row] = await db.execute<{ id: string }>(sql`
    select id from opportunities where client_id = ${clientId} and status = 'abierta'
    order by created_at desc limit 1`);
  return row?.id ?? null;
}
