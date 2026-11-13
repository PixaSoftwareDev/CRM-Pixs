/**
 * Reglas de Tareas. Cada cambio relevante (la pasó a otro día, se la pasó a un
 * compañero, cambió de estado) queda como comentario en la tarea, y finalizar
 * una llamada o reunión cuenta como contacto con el cliente.
 */
import { activities, type Db, type DbOrTx, eq, taskComments, tasks, taskTypes } from "@crm/db";
import {
  type TaskCommentCreate,
  type TaskCreate,
  type TaskStatus,
  type TaskTypeCreate,
  type TaskUpdate,
  taskCommentCreate,
  taskCreate,
  taskTypeCreate,
  taskUpdate,
} from "@crm/shared";
import { fmtWhen, nextWorkdayAt } from "../../lib/dates";
import { BadRequestError, ConflictError, isUniqueViolation, NotFoundError } from "../../lib/errors";
import { isRuleEnabled, recordRun } from "../automations/service";
import { advanceFromTask, openOpportunityOfClient, type TaskEvent } from "../sales/automation";
import { ticketOfWorkTask, workDoneTx } from "../tickets/service";
import * as repo from "./repository";

export { listTaskTypes, listTeam } from "./repository";

const STATUS_LABEL: Record<TaskStatus, string> = {
  pendiente: "Pendiente",
  en_curso: "En curso",
  esperando: "Esperando al cliente",
  hecha: "Finalizada",
  cancelada: "Cancelada",
};

/** Tipos de tarea que, al finalizarse, cuentan como contacto con el cliente. */
const CONTACT_KIND: Record<string, "llamada" | "reunion"> = { Llamada: "llamada", Reunión: "reunion" };

async function requireTask(db: DbOrTx, id: string) {
  const task = await repo.findTask(db, id);
  if (!task) throw new NotFoundError("Tarea");
  return task;
}

/** Valida las referencias antes de escribir, para responder 400 con un mensaje claro. */
async function checkRefs(db: DbOrTx, refs: { typeId?: string | undefined; clientId?: string | null | undefined; assigneeId?: string | undefined }) {
  const [typeOk, clientOk, userOk] = await Promise.all([
    refs.typeId ? repo.existsIn(db, "task_types", refs.typeId) : true,
    refs.clientId ? repo.existsIn(db, "clients", refs.clientId) : true,
    refs.assigneeId ? repo.isActiveUser(db, refs.assigneeId) : true,
  ]);
  if (!typeOk) throw new BadRequestError("El tipo de tarea no existe");
  if (!clientOk) throw new BadRequestError("El cliente no existe");
  if (!userOk) throw new BadRequestError("El responsable no existe o está inactivo");
}

const comment = (db: DbOrTx, taskId: string, authorId: string, body: string) =>
  db.insert(taskComments).values({ taskId, authorId, body });

// ─── Lecturas ───────────────────────────────────────────────────────────────

export const listTasksInRange = (db: Db, q: { from: string; to: string }) => repo.listTasksInRange(db, q.from, q.to);

export async function getTask(db: Db, id: string) {
  const task = await repo.getTaskDetail(db, id);
  if (!task) throw new NotFoundError("Tarea");
  return task;
}

// ─── Escrituras ─────────────────────────────────────────────────────────────

export async function createTask(db: Db, actorId: string, input: TaskCreate) {
  const data = taskCreate.parse(input);
  const assigneeId = data.assigneeId ?? actorId;
  await checkRefs(db, { typeId: data.typeId, clientId: data.clientId, assigneeId });

  const typeName = (await repo.listTaskTypes(db)).find((t) => t.id === data.typeId)?.name ?? "";

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(tasks)
      .values({
        title: data.title,
        typeId: data.typeId,
        clientId: data.clientId ?? null,
        projectId: data.projectId ?? null,
        // Si el cliente está en el embudo, la tarea queda colgada de su oportunidad.
        opportunityId: data.clientId ? await openOpportunityOfClient(tx, data.clientId) : null,
        assigneeId,
        assignedById: assigneeId === actorId ? null : actorId,
        createdById: actorId,
        startsAt: data.startsAt ? new Date(data.startsAt) : null,
        durationMinutes: data.durationMinutes,
      })
      .returning({ id: tasks.id });
    if (!row) throw new Error("No se pudo crear la tarea");
    if (data.startsAt) await advanceFromTask(tx, actorId, { taskId: row.id, typeName, event: "scheduled" });
    return row;
  });
}

export async function updateTask(db: Db, actorId: string, id: string, input: TaskUpdate) {
  const { comment: note, ...data } = taskUpdate.parse(input);
  const before = await requireTask(db, id);
  await checkRefs(db, data);

  const patch: Partial<typeof tasks.$inferInsert> = {};
  const log: string[] = [];

  if (data.title !== undefined && data.title !== before.title) patch.title = data.title;
  if (data.typeId !== undefined && data.typeId !== before.type.id) patch.typeId = data.typeId;
  if (data.clientId !== undefined && data.clientId !== (before.client?.id ?? null)) patch.clientId = data.clientId;

  const startsAt = data.startsAt === undefined ? before.startsAt : data.startsAt && new Date(data.startsAt).toISOString();
  const duration = data.durationMinutes ?? before.durationMinutes;
  if (startsAt !== before.startsAt || duration !== before.durationMinutes) {
    patch.startsAt = startsAt ? new Date(startsAt) : null;
    patch.durationMinutes = duration;
    if (startsAt) {
      const end = new Date(Date.parse(startsAt) + duration * 60_000).toISOString();
      log.push(`La pasó al ${fmtWhen(startsAt)}–${fmtWhen(end).slice(-5)}.`);
    } else {
      log.push("La dejó sin fecha.");
    }
  }

  if (data.assigneeId !== undefined && data.assigneeId !== before.assignee.id) {
    patch.assigneeId = data.assigneeId;
    patch.assignedById = actorId === data.assigneeId ? null : actorId;
    const team = await repo.listTeam(db);
    log.push(`Se la pasó a ${team.find((u) => u.id === data.assigneeId)?.name ?? "otra persona"}.`);
  }

  const finished = data.status === "hecha" && before.status !== "hecha";
  if (data.status !== undefined && data.status !== before.status) {
    patch.status = data.status;
    patch.completedAt = data.status === "hecha" ? new Date() : null;
    log.push(`Estado: ${STATUS_LABEL[before.status]} → ${STATUS_LABEL[data.status]}.`);
  }

  if (Object.keys(patch).length === 0 && !note) return;

  // Qué le pasó a la tarea, para el embudo.
  const events: TaskEvent[] = [];
  if (finished) events.push("done");
  else if (patch.status === "en_curso") events.push("in_progress");
  if (patch.startsAt && !finished && (patch.status ?? before.status) !== "hecha") events.push("scheduled");
  const typeName = patch.typeId
    ? ((await repo.listTaskTypes(db)).find((t) => t.id === patch.typeId)?.name ?? "")
    : before.type.name;

  await db.transaction(async (tx) => {
    if (Object.keys(patch).length) {
      await tx.update(tasks).set({ ...patch, updatedAt: new Date() }).where(eq(tasks.id, id));
    }
    // El comentario del usuario primero, después el registro automático de lo que cambió.
    if (note) await comment(tx, id, actorId, note);
    for (const line of log) await comment(tx, id, actorId, line);

    const clientId = patch.clientId === undefined ? before.client?.id : patch.clientId;
    if (finished && clientId) {
      await tx.insert(activities).values({
        clientId,
        actorId,
        kind: CONTACT_KIND[before.type.name] ?? "sistema",
        title: `Tarea finalizada: ${patch.title ?? before.title}`,
        body: note || null,
      });
    }

    for (const event of events) await advanceFromTask(tx, actorId, { taskId: id, typeName, event, note });

    // Regla "el técnico finalizó la tarea de un ticket → el ticket pasa a confirmar".
    if (finished) await advanceTicketFromTask(tx, actorId, id, note);
  });
}

export async function addComment(db: Db, actorId: string, id: string, input: TaskCommentCreate) {
  const { body } = taskCommentCreate.parse(input);
  await requireTask(db, id);
  await comment(db, id, actorId, body);
}

// ─── Tipos de tarea ─────────────────────────────────────────────────────────

export async function createTaskType(db: Db, input: TaskTypeCreate) {
  const data = taskTypeCreate.parse(input);
  try {
    const [row] = await db
      .insert(taskTypes)
      .values({ name: data.name, color: data.color.toLowerCase(), position: 100 })
      .returning({ id: taskTypes.id });
    if (!row) throw new Error("No se pudo crear el tipo");
    return row;
  } catch (err) {
    if (isUniqueViolation(err, "task_types_name_uq")) throw new ConflictError("Ya existe un tipo con ese nombre");
    throw err;
  }
}

export async function deleteTaskType(db: Db, id: string) {
  const type = (await repo.listTaskTypes(db)).find((t) => t.id === id);
  if (!type) throw new NotFoundError("Tipo de tarea");
  if (type.isSystem) throw new ConflictError("Este tipo lo usan las automatizaciones: no se puede borrar");
  if (type.inUse > 0) throw new ConflictError("Hay tareas de este tipo: cambiales el tipo antes de borrarlo");
  await db.delete(taskTypes).where(eq(taskTypes.id, id));
}

/**
 * Si la tarea finalizada es el trabajo de un ticket en curso y la regla está
 * activa: llama a confirmar quien cargó el ticket (o quien finalizó), el
 * próximo día hábil a las 10.
 */
async function advanceTicketFromTask(tx: DbOrTx, actorId: string, taskId: string, note: string | undefined) {
  const ruleId = await isRuleEnabled(tx, "tarea_de_ticket_hecha", "avanzar_ticket");
  if (!ruleId) return;
  const ticket = await ticketOfWorkTask(tx, taskId);
  if (!ticket) return;
  const confirmerId = ticket.reporter_id ?? actorId;
  const confirmer = (await repo.listTeam(tx)).find((u) => u.id === confirmerId)?.name ?? "quien cargó el ticket";
  await workDoneTx(
    tx,
    actorId,
    ticket,
    confirmer,
    { confirmerId, confirmAt: nextWorkdayAt("10:00").toISOString(), ...(note && { note }) },
    { auto: true, closeWork: false },
  );
  await recordRun(tx, ruleId, [{ entityType: "ticket", entityId: ticket.id }]);
}
