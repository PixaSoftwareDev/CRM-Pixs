/**
 * Línea de tiempo del cliente (pestaña "Actividad" del Cliente 360).
 * Registro denormalizado y append-only: se escribe junto con cada evento de negocio
 * (ticket creado, cobro, reunión…) para leer el historial con UNA consulta indexada,
 * sin unir media base.
 */
import { sql } from "drizzle-orm";
import { index, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { createdAt, id, ref, tstz } from "./_shared/columns";
import { clients } from "./clients";
import { documents } from "./finance";
import { users } from "./identity";
import { projects } from "./projects";
import { tickets } from "./support";

export const activityKind = pgEnum("activity_kind", [
  "nota",
  "llamada",
  "reunion",
  "whatsapp",
  "email",
  "ticket",
  "cobro",
  "factura",
  "sistema",
]);

export const activities = pgTable(
  "activities",
  {
    id: id(),
    clientId: ref()
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    kind: activityKind().notNull(),
    title: text().notNull(),
    body: text(),
    /** null = lo registró una automatización. */
    actorId: ref().references(() => users.id, { onDelete: "set null" }),
    projectId: ref().references(() => projects.id, { onDelete: "set null" }),
    ticketId: ref().references(() => tickets.id, { onDelete: "set null" }),
    documentId: ref().references(() => documents.id, { onDelete: "set null" }),
    occurredAt: tstz().notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    index("activities_client_timeline_idx").on(t.clientId, t.occurredAt.desc()),
    // "Último contacto" por cliente (alerta de 30 días sin contacto).
    index("activities_client_contact_idx")
      .on(t.clientId, t.occurredAt.desc())
      .where(sql`${t.kind} IN ('llamada', 'reunion', 'whatsapp', 'email')`),
  ],
);
