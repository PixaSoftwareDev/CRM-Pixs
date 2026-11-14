/**
 * Flujo de Tickets. Cada paso crea o cierra tareas reales en la agenda, así el
 * trabajo aparece en Mi día de quien lo tiene que hacer:
 *
 *   asignar        → tarea de trabajo para el técnico
 *   trabajo listo  → cierra esa tarea y agenda la llamada de confirmación
 *   confirmar ok   → cierra la llamada y el ticket
 *   no quedó bien  → cierra la llamada y le agenda otra vez el trabajo al técnico
 */
import {
  activities,
  and,
  type Db,
  type DbOrTx,
  eq,
  inArray,
  ne,
  sql,
  taskComments,
  tasks,
  ticketEvents,
  tickets,
  timeEntries,
} from "@crm/db";
import {
  type TicketAssign,
  type TicketCancel,
  type TicketConfirm,
  type TicketCreate,
  type TicketNote,
  type TicketStatus,
  type TicketUpdate,
  type TicketWorkDone,
  ticketAssign,
  ticketCancel,
  ticketConfirm,
  ticketCreate,
  ticketNote,
  ticketUpdate,
  ticketWorkDone,
} from "@crm/shared";
import type { z } from "zod";
import { endOfDayAr, fmtWhen } from "../../lib/dates";
import { BadRequestError, ConflictError, NotFoundError } from "../../lib/errors";
import { todayAr } from "../../lib/sql";
import { isActiveUser, listTaskTypes, listTeam } from "../tasks/repository";
import * as repo from "./repository";

export { listTickets } from "./repository";

type EventKind = (typeof ticketEvents.$inferInsert)["kind"];

const CONFIRM_TYPE = "Llamada";
const workType = (type: string) => (type === "falla" ? "Falla" : "Implementación");

async function requireTicket(db: DbOrTx, id: string, allowed?: TicketStatus[]) {
  const t = await repo.findTicket(db, id);
  if (!t) throw new NotFoundError("Ticket");
  if (allowed && !allowed.includes(t.status)) {
    throw new ConflictError("El ticket cambió de estado mientras tanto: recargá la página");
  }
  return t;
}

/**
 * Bloquea la fila del ticket dentro de la transacción y vuelve a chequear el estado:
 * un doble clic (o dos personas a la vez) no duplica tareas, horas ni eventos.
 */
async function lockTicket(tx: DbOrTx, id: string, allowed: TicketStatus[]) {
  const [row] = await tx.execute<{ status: TicketStatus }>(sql`select status from tickets where id = ${id} for update`);
  if (!row || !allowed.includes(row.status)) {
    throw new ConflictError("El ticket cambió de estado mientras tanto: recargá la página");
  }
  return row.status;
}

async function typeId(db: DbOrTx, name: string) {
  const type = (await listTaskTypes(db)).find((t) => t.name === name);
  if (!type) throw new Error(`Falta el tipo de tarea ${name}: corré pnpm db:seed`);
  return type.id;
}

async function userName(db: DbOrTx, id: string) {
  if (!(await isActiveUser(db, id))) throw new BadRequestError("La persona elegida no existe o está inactiva");
  return (await listTeam(db)).find((u) => u.id === id)?.name ?? "otra persona";
}

const event = (db: DbOrTx, ticketId: string, actorId: string | null, kind: EventKind, message: string) =>
  db.insert(ticketEvents).values({ ticketId, actorId, kind, message });

/** Cierra las tareas abiertas del ticket de un tipo (trabajo o confirmación). */
async function closeTasks(db: DbOrTx, ticketId: string, which: "work" | "confirm", status: "hecha" | "cancelada", actorId: string, note?: string) {
  const confirmType = await typeId(db, CONFIRM_TYPE);
  const open = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.ticketId, ticketId),
        inArray(tasks.status, ["pendiente", "en_curso", "esperando"]),
        which === "confirm" ? eq(tasks.typeId, confirmType) : ne(tasks.typeId, confirmType),
      ),
    );
  if (!open.length) return;
  const ids = open.map((t) => t.id);
  await db
    .update(tasks)
    .set({ status, completedAt: status === "hecha" ? new Date() : null, updatedAt: new Date() })
    .where(inArray(tasks.id, ids));
  if (note) await db.insert(taskComments).values(ids.map((taskId) => ({ taskId, authorId: actorId, body: note })));
}

interface TicketRef {
  id: string;
  number: number;
  title: string;
  type: string;
  client_id: string;
  project_id: string | null;
}

/** Tarea de trabajo en la agenda del técnico. */
async function scheduleWork(db: DbOrTx, t: TicketRef, actorId: string, assigneeId: string, at: Date, minutes = 60) {
  await db.insert(tasks).values({
    title: `#${t.number} · ${t.title}`,
    typeId: await typeId(db, workType(t.type)),
    clientId: t.client_id,
    projectId: t.project_id,
    ticketId: t.id,
    assigneeId,
    assignedById: assigneeId === actorId ? null : actorId,
    createdById: actorId,
    startsAt: at,
    durationMinutes: minutes,
  });
}

// ─── Lecturas ───────────────────────────────────────────────────────────────

export async function getTicket(db: Db, id: string) {
  const t = await repo.getTicketDetail(db, id);
  if (!t) throw new NotFoundError("Ticket");
  return t;
}

// ─── Alta y edición ─────────────────────────────────────────────────────────

export async function createTicket(db: Db, actorId: string, input: TicketCreate) {
  const data = ticketCreate.parse(input);
  const reporterId = data.reportedById ?? actorId;
  const [client] = await db.execute(sql`select 1 from clients where id = ${data.clientId}`);
  if (!client) throw new BadRequestError("El cliente no existe");
  if (data.projectId) {
    const [p] = await db.execute(sql`select 1 from projects where id = ${data.projectId} and client_id = ${data.clientId}`);
    if (!p) throw new BadRequestError("El proyecto no es de ese cliente");
  }
  const reporter = await userName(db, reporterId);
  const assignee = data.assignTo ? await userName(db, data.assignTo.assigneeId) : null;

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(tickets)
      .values({
        clientId: data.clientId,
        projectId: data.projectId ?? null,
        type: data.type,
        channel: data.channel,
        priority: data.priority,
        title: data.title,
        description: data.description || null,
        reportedById: reporterId,
        receivedAt: data.receivedAt ? new Date(data.receivedAt) : new Date(),
        dueAt: data.dueOn ? endOfDayAr(data.dueOn) : null,
      })
      .returning({ id: tickets.id, number: tickets.number });
    if (!row) throw new Error("No se pudo crear el ticket");

    await event(tx, row.id, actorId, "creado", `Cargado por ${reporter}`);
    await tx.insert(activities).values({
      clientId: data.clientId,
      actorId,
      ticketId: row.id,
      projectId: data.projectId ?? null,
      kind: "ticket",
      title: `Ticket #${row.number}: ${data.title}`,
      body: data.description || null,
    });

    if (data.assignTo && assignee) {
      const at = new Date(data.assignTo.scheduledAt);
      const ref: TicketRef = { id: row.id, number: row.number, title: data.title, type: data.type, client_id: data.clientId, project_id: data.projectId ?? null };
      await scheduleWork(tx, ref, actorId, data.assignTo.assigneeId, at);
      await tx
        .update(tickets)
        .set({ status: "en_curso", assigneeId: data.assignTo.assigneeId, scheduledAt: at })
        .where(eq(tickets.id, row.id));
      await event(tx, row.id, actorId, "asignado", `Asignado a ${assignee}: tarea en su agenda ${fmtWhen(at)}`);
    }
    return row;
  });
}

const PRIORITY_LABEL = { normal: "Normal", alta: "Alta", urgente: "Urgente" } as const;

export async function updateTicket(db: Db, actorId: string, id: string, input: TicketUpdate) {
  const data = ticketUpdate.parse(input);
  const before = await requireTicket(db, id);
  if (data.projectId) {
    const [p] = await db.execute(sql`select 1 from projects where id = ${data.projectId} and client_id = ${before.client_id}`);
    if (!p) throw new BadRequestError("El proyecto no es de ese cliente");
  }
  const patch: Partial<typeof tickets.$inferInsert> = { updatedAt: new Date() };
  const notes: string[] = [];
  if (data.title !== undefined) patch.title = data.title;
  if (data.description !== undefined) patch.description = data.description || null;
  if (data.type !== undefined) patch.type = data.type;
  if (data.projectId !== undefined) patch.projectId = data.projectId;
  if (data.priority !== undefined && data.priority !== before.priority) {
    patch.priority = data.priority;
    notes.push(`Urgencia: ${PRIORITY_LABEL[before.priority]} → ${PRIORITY_LABEL[data.priority]}`);
  }
  if (data.dueOn !== undefined) {
    patch.dueAt = data.dueOn ? endOfDayAr(data.dueOn) : null;
    notes.push(data.dueOn ? `Compromiso: ${data.dueOn.split("-").reverse().join("/")}` : "Sin fecha de compromiso");
  }
  await db.transaction(async (tx) => {
    await tx.update(tickets).set(patch).where(eq(tickets.id, id));
    for (const n of notes) await event(tx, id, actorId, "estado", n);
  });
}

export async function addNote(db: Db, actorId: string, id: string, input: TicketNote) {
  const { body } = ticketNote.parse(input);
  await requireTicket(db, id);
  await event(db, id, actorId, "nota", body);
}

// ─── Flujo ──────────────────────────────────────────────────────────────────

/** Paso 1 (o reasignar mientras está en trabajo). */
export async function assignTicket(db: Db, actorId: string, id: string, input: TicketAssign) {
  const data = ticketAssign.parse(input);
  const t = await requireTicket(db, id, ["nuevo", "en_curso"]);
  const name = await userName(db, data.assigneeId);
  const at = new Date(data.scheduledAt);

  await db.transaction(async (tx) => {
    // Estado leído con la fila bloqueada: si otro pedido ya asignó, esto es una reasignación.
    const status = await lockTicket(tx, id, ["nuevo", "en_curso"]);
    // Reasignar: la tarea anterior se cancela, la nueva queda en la agenda del nuevo técnico.
    if (status === "en_curso") await closeTasks(tx, id, "work", "cancelada", actorId, `Reasignado a ${name}.`);
    await scheduleWork(tx, t, actorId, data.assigneeId, at, data.durationMinutes);
    await tx
      .update(tickets)
      .set({ status: "en_curso", assigneeId: data.assigneeId, scheduledAt: at, updatedAt: new Date() })
      .where(eq(tickets.id, id));
    await event(tx, id, actorId, "asignado", `Asignado a ${name}: tarea en su agenda ${fmtWhen(at)}`);
  });
}

/** Paso 2: el técnico terminó. Se agenda la llamada para que el cliente confirme. */
export async function workDone(db: Db, actorId: string, id: string, input: TicketWorkDone) {
  const data = ticketWorkDone.parse(input);
  const t = await requireTicket(db, id, ["en_curso"]);
  const confirmer = await userName(db, data.confirmerId);
  await db.transaction(async (tx) => {
    await lockTicket(tx, id, ["en_curso"]);
    return workDoneTx(tx, actorId, t, confirmer, data);
  });
}

type TicketRow = NonNullable<Awaited<ReturnType<typeof repo.findTicket>>>;

/**
 * Lo mismo que `workDone`, dentro de una transacción ajena: lo usa la
 * automatización "el técnico finalizó su tarea → el ticket pasa a confirmar".
 */
export async function workDoneTx(
  tx: DbOrTx,
  actorId: string,
  t: TicketRow,
  confirmerName: string,
  data: z.output<typeof ticketWorkDone>,
  opts: { auto?: boolean; closeWork?: boolean } = {},
) {
  const at = new Date(data.confirmAt);
  const tech = t.assignee_name ?? "El técnico";
  if (opts.closeWork !== false) await closeTasks(tx, t.id, "work", "hecha", actorId, data.note);
  await tx.insert(tasks).values({
    title: `Confirmar con el cliente · #${t.number} ${t.title}`,
    typeId: await typeId(tx, CONFIRM_TYPE),
    clientId: t.client_id,
    projectId: t.project_id,
    ticketId: t.id,
    assigneeId: data.confirmerId,
    assignedById: data.confirmerId === actorId ? null : actorId,
    createdById: actorId,
    startsAt: at,
    durationMinutes: 15,
  });
  if (data.minutes && t.project_id && t.assignee_id) {
    const [today] = await tx.execute<{ d: string }>(sql`select ${todayAr}::text as d`);
    await tx.insert(timeEntries).values({
      userId: t.assignee_id,
      projectId: t.project_id,
      ticketId: t.id,
      workedOn: today?.d ?? new Date().toISOString().slice(0, 10),
      minutes: data.minutes,
      note: `Ticket #${t.number}`,
    });
  }
  await tx
    .update(tickets)
    .set({ status: "a_confirmar", confirmerId: data.confirmerId, confirmAt: at, updatedAt: new Date() })
    .where(eq(tickets.id, t.id));
  const how = opts.auto ? " (finalizó su tarea en Mi día)" : "";
  await event(tx, t.id, actorId, "estado", `${tech} terminó el trabajo${how}${data.note ? `: "${data.note}"` : ""}`);
  await event(tx, t.id, opts.auto ? null : actorId, "estado", `Llamada de confirmación agendada para ${confirmerName} (${fmtWhen(at)})`);
}

/** Ticket abierto de una tarea, si la tarea es el trabajo del técnico (no la llamada de confirmación). */
export async function ticketOfWorkTask(db: DbOrTx, taskId: string): Promise<TicketRow | null> {
  const [row] = await db.execute<{ ticket_id: string }>(sql`
    select t.ticket_id from tasks t join task_types tt on tt.id = t.type_id
    where t.id = ${taskId} and t.ticket_id is not null and tt.name <> ${CONFIRM_TYPE}`);
  if (!row) return null;
  const ticket = await repo.findTicket(db, row.ticket_id);
  return ticket?.status === "en_curso" ? ticket : null;
}

/** Paso 3: lo que dijo el cliente. */
export async function confirmTicket(db: Db, actorId: string, id: string, input: TicketConfirm) {
  const data = ticketConfirm.parse(input);
  const t = await requireTicket(db, id, ["a_confirmar"]);
  const [actor] = await db.execute<{ name: string }>(sql`select name from users where id = ${actorId}`);
  const who = actor?.name ?? "Alguien";
  const quote = data.note ? `: "${data.note}"` : "";

  await db.transaction(async (tx) => {
    await lockTicket(tx, id, ["a_confirmar"]);
    await closeTasks(tx, id, "confirm", "hecha", actorId, data.note);
    if (data.ok) {
      await tx
        .update(tickets)
        .set({
          status: "resuelto",
          resolvedAt: new Date(),
          resolvedById: t.assignee_id,
          resolutionNote: data.note || null,
          updatedAt: new Date(),
        })
        .where(eq(tickets.id, id));
      await event(tx, id, actorId, "confirmado", `${who} llamó al cliente: confirmó que quedó bien${quote}. Ticket cerrado`);
      await tx.insert(activities).values({
        clientId: t.client_id,
        actorId,
        ticketId: id,
        projectId: t.project_id,
        kind: "ticket",
        title: `Ticket #${t.number} resuelto`,
        body: data.note || null,
      });
      return;
    }
    if (!t.assignee_id || !data.retryAt) throw new BadRequestError("Indicá cuándo lo retoma");
    const at = new Date(data.retryAt);
    await scheduleWork(tx, t, actorId, t.assignee_id, at);
    await tx.update(tickets).set({ status: "en_curso", scheduledAt: at, updatedAt: new Date() }).where(eq(tickets.id, id));
    await event(
      tx,
      id,
      actorId,
      "estado",
      `El cliente dice que no quedó bien${quote}. Vuelve a ${t.assignee_name ?? "el técnico"} (${fmtWhen(at)})`,
    );
  });
}

export async function cancelTicket(db: Db, actorId: string, id: string, input: TicketCancel) {
  const { reason } = ticketCancel.parse(input);
  await requireTicket(db, id, ["nuevo", "en_curso", "a_confirmar"]);
  await db.transaction(async (tx) => {
    await lockTicket(tx, id, ["nuevo", "en_curso", "a_confirmar"]);
    await closeTasks(tx, id, "work", "cancelada", actorId, `Ticket cancelado: ${reason}`);
    await closeTasks(tx, id, "confirm", "cancelada", actorId, `Ticket cancelado: ${reason}`);
    await tx.update(tickets).set({ status: "cancelado", updatedAt: new Date() }).where(eq(tickets.id, id));
    await event(tx, id, actorId, "estado", `Cancelado: ${reason}`);
  });
}

/**
 * Cambios hechos desde Mi día sobre la tarea de trabajo de un ticket en curso:
 * pasársela a otro → el ticket queda asignado a esa persona; cancelarla (sin
 * otra tarea de trabajo abierta) → el ticket vuelve a Nuevo para reasignarlo.
 */
export async function syncTicketFromWorkTask(
  tx: DbOrTx,
  actorId: string,
  taskId: string,
  change: { assigneeId?: string; assigneeName?: string; startsAt?: Date | null; cancelled?: boolean },
) {
  const ticket = await ticketOfWorkTask(tx, taskId);
  if (!ticket) return;
  await lockTicket(tx, ticket.id, ["en_curso"]);
  if (change.cancelled) {
    const [open] = await tx.execute(sql`
      select 1 from tasks t join task_types tt on tt.id = t.type_id
      where t.ticket_id = ${ticket.id} and t.id <> ${taskId} and tt.name <> ${CONFIRM_TYPE}
        and t.status in ('pendiente', 'en_curso', 'esperando')`);
    if (open) return;
    await tx.update(tickets).set({ status: "nuevo", assigneeId: null, scheduledAt: null, updatedAt: new Date() }).where(eq(tickets.id, ticket.id));
    await event(tx, ticket.id, actorId, "estado", "Se canceló la tarea de trabajo desde Mi día: el ticket vuelve a Nuevo para asignarlo");
    return;
  }
  const patch: Partial<typeof tickets.$inferInsert> = { updatedAt: new Date() };
  if (change.assigneeId && change.assigneeId !== ticket.assignee_id) {
    patch.assigneeId = change.assigneeId;
    await event(tx, ticket.id, actorId, "asignado", `Reasignado a ${change.assigneeName ?? "otra persona"} desde Mi día`);
  }
  if (change.startsAt !== undefined) patch.scheduledAt = change.startsAt;
  if (Object.keys(patch).length > 1) await tx.update(tickets).set(patch).where(eq(tickets.id, ticket.id));
}
