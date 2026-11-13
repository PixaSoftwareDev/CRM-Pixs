/**
 * Trabajo diario: "Mi día" y "Agenda" son la misma entidad (una tarea con
 * fecha/hora es un evento de agenda). Los tipos tienen color y son configurables.
 * Una tarea puede colgar de un cliente, proyecto, oportunidad o ticket; al
 * cambiar su estado, el servicio mueve la oportunidad en el embudo.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { createdAt, id, ref, timestamps, tstz } from "./_shared/columns";
import { clients } from "./clients";
import { users } from "./identity";
import { projects } from "./projects";
import { opportunities } from "./sales";
import { tickets } from "./support";

export const taskStatus = pgEnum("task_status", [
  "pendiente",
  "en_curso",
  "esperando",
  "hecha",
  "cancelada",
]);

export const taskTypes = pgTable(
  "task_types",
  {
    id: id(),
    name: text().notNull(),
    color: varchar({ length: 7 }).notNull(),
    position: smallint().notNull().default(0),
    /** Tipos que usan las automatizaciones (cobranza, llamada…): no se pueden borrar. */
    isSystem: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("task_types_name_uq").on(t.name)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    title: text().notNull(),
    typeId: ref()
      .notNull()
      .references(() => taskTypes.id, { onDelete: "restrict" }),
    status: taskStatus().notNull().default("pendiente"),
    assigneeId: ref()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** Quién se la pasó (si fue reasignada por un compañero). */
    assignedById: ref().references(() => users.id, { onDelete: "set null" }),
    createdById: ref().references(() => users.id, { onDelete: "set null" }),
    clientId: ref().references(() => clients.id, { onDelete: "set null" }),
    projectId: ref().references(() => projects.id, { onDelete: "set null" }),
    opportunityId: ref().references(() => opportunities.id, { onDelete: "set null" }),
    ticketId: ref().references(() => tickets.id, { onDelete: "set null" }),
    /** null = sin agendar. */
    startsAt: tstz(),
    durationMinutes: integer().notNull().default(60),
    completedAt: tstz(),
    /** Se archivan solas a los 14 días de hechas (job programado). */
    archivedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    check("tasks_duration_ck", sql`${t.durationMinutes} > 0`),
    check(
      "tasks_completed_ck",
      sql`(${t.status} = 'hecha') = (${t.completedAt} IS NOT NULL)`,
    ),
    // "Mi día" / agenda: tareas vivas de una persona en un rango de fechas.
    index("tasks_assignee_starts_idx")
      .on(t.assigneeId, t.startsAt)
      .where(sql`${t.archivedAt} IS NULL`),
    // Agenda del equipo por rango de fechas.
    index("tasks_starts_idx").on(t.startsAt).where(sql`${t.archivedAt} IS NULL`),
    // Job de archivado.
    index("tasks_done_idx")
      .on(t.completedAt)
      .where(sql`${t.status} = 'hecha' AND ${t.archivedAt} IS NULL`),
    index("tasks_client_idx").on(t.clientId),
    index("tasks_project_idx").on(t.projectId),
    index("tasks_opportunity_idx").on(t.opportunityId),
    index("tasks_ticket_idx").on(t.ticketId),
  ],
);

export const taskComments = pgTable(
  "task_comments",
  {
    id: id(),
    taskId: ref()
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    authorId: ref().references(() => users.id, { onDelete: "set null" }),
    body: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("task_comments_task_idx").on(t.taskId, t.createdAt)],
);

/** Horas trabajadas: alimentan "horas consumidas" del proyecto y la alerta de exceso. */
export const timeEntries = pgTable(
  "time_entries",
  {
    id: id(),
    userId: ref()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    projectId: ref()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    ticketId: ref().references(() => tickets.id, { onDelete: "set null" }),
    taskId: ref().references(() => tasks.id, { onDelete: "set null" }),
    workedOn: date({ mode: "string" }).notNull(),
    minutes: integer().notNull(),
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [
    check("time_entries_minutes_ck", sql`${t.minutes} > 0`),
    index("time_entries_project_idx").on(t.projectId, t.workedOn),
    index("time_entries_user_idx").on(t.userId, t.workedOn),
  ],
);
