/**
 * Tickets de soporte (pantalla "Tickets"). Flujo:
 * nuevo → en_curso (asignado y agendado) → a_confirmar (alguien llama al cliente) → resuelto.
 * `number` es el número visible (#121), separado del id interno.
 */
import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { createdAt, id, ref, timestamps, tstz } from "./_shared/columns";
import { trgmIndex } from "./_shared/indexes";
import { clients } from "./clients";
import { users } from "./identity";
import { projects } from "./projects";

export const ticketType = pgEnum("ticket_type", ["falla", "implementacion", "consulta", "mejora"]);
export const ticketChannel = pgEnum("ticket_channel", [
  "telefono",
  "whatsapp",
  "email",
  "web",
  "presencial",
]);
export const ticketPriority = pgEnum("ticket_priority", ["normal", "alta", "urgente"]);
export const ticketStatus = pgEnum("ticket_status", [
  "nuevo",
  "en_curso",
  "a_confirmar",
  "resuelto",
  "cancelado",
]);
export const ticketEventKind = pgEnum("ticket_event_kind", [
  "creado",
  "asignado",
  "estado",
  "nota",
  "adjunto",
  "confirmado",
]);

export const tickets = pgTable(
  "tickets",
  {
    id: id(),
    number: integer().notNull().generatedAlwaysAsIdentity({ startWith: 100 }),
    clientId: ref()
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    projectId: ref().references(() => projects.id, { onDelete: "set null" }),
    type: ticketType().notNull(),
    channel: ticketChannel().notNull(),
    priority: ticketPriority().notNull().default("normal"),
    status: ticketStatus().notNull().default("nuevo"),
    title: text().notNull(),
    description: text(),
    /** Quién lo cargó ("quién entrega la tarea"). null = entró solo (WhatsApp/mail). */
    reportedById: ref().references(() => users.id, { onDelete: "set null" }),
    receivedAt: tstz().notNull().defaultNow(),
    /** Fecha de compromiso con el cliente. */
    dueAt: tstz(),
    suggestedAssigneeId: ref().references(() => users.id, { onDelete: "set null" }),
    assigneeId: ref().references(() => users.id, { onDelete: "set null" }),
    /** Cuándo se trabaja (genera la tarea en la agenda del técnico). */
    scheduledAt: tstz(),
    /** Quién llama al cliente para confirmar, y cuándo. */
    confirmerId: ref().references(() => users.id, { onDelete: "set null" }),
    confirmAt: tstz(),
    resolvedAt: tstz(),
    resolvedById: ref().references(() => users.id, { onDelete: "set null" }),
    resolutionNote: text(),
    /** Baja lógica: oculto de listados, sin borrar nada. null = activo. */
    archivedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("tickets_number_uq").on(t.number),
    // Bandeja principal: abiertos por estado ordenados por compromiso.
    index("tickets_open_status_due_idx")
      .on(t.status, t.dueAt)
      .where(sql`${t.status} NOT IN ('resuelto', 'cancelado')`),
    index("tickets_assignee_status_idx").on(t.assigneeId, t.status),
    index("tickets_client_idx").on(t.clientId, t.receivedAt),
    index("tickets_project_idx").on(t.projectId),
    trgmIndex("tickets_title_trgm", t.title),
  ],
);

/** Bitácora del ticket (append-only). */
export const ticketEvents = pgTable(
  "ticket_events",
  {
    id: id(),
    ticketId: ref()
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    kind: ticketEventKind().notNull(),
    message: text().notNull(),
    /** Detalle estructurado (p. ej. { from: "nuevo", to: "en_curso" }). */
    data: jsonb().$type<Record<string, unknown>>(),
    /** null = evento automático. */
    actorId: ref().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("ticket_events_ticket_idx").on(t.ticketId, t.createdAt)],
);
