/**
 * Proyectos de implementación. Se crean a mano o solos al ganar una oportunidad;
 * en ese caso guardan una foto de los datos de la venta (monto, forma de pago,
 * alcance) para que no cambien si después se edita la oportunidad.
 * El avance y las horas consumidas se calculan desde tickets, tareas y time_entries.
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
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { id, money, ref, timestamps, tstz } from "./_shared/columns";
import { trgmIndex } from "./_shared/indexes";
import { clients } from "./clients";
import { users } from "./identity";
import { opportunities } from "./sales";

export const projectStatus = pgEnum("project_status", [
  "nuevo",
  "en_curso",
  "en_riesgo",
  "pausado",
  "entregado",
  "cancelado",
]);

/** Etapa de trabajo del proyecto; el avance se mide por etapas cumplidas. */
export const projectPhase = pgEnum("project_phase", [
  "kickoff",
  "relevamiento",
  "desarrollo",
  "pruebas",
  "entrega",
]);

export const projects = pgTable(
  "projects",
  {
    id: id(),
    name: text().notNull(),
    clientId: ref()
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    opportunityId: ref().references(() => opportunities.id, { onDelete: "set null" }),
    implementerId: ref().references(() => users.id, { onDelete: "set null" }),
    status: projectStatus().notNull().default("nuevo"),
    phase: projectPhase().notNull().default("kickoff"),
    startsOn: date({ mode: "string" }),
    dueOn: date({ mode: "string" }),
    dueIsEstimate: boolean().notNull().default(true),
    estimatedHours: integer(),
    scope: text(),
    // Foto de la venta
    saleAmount: money(),
    paymentTerms: text(),
    sellerId: ref().references(() => users.id, { onDelete: "set null" }),
    soldOn: date({ mode: "string" }),
    createdAutomatically: boolean().notNull().default(false),
    /** Baja lógica: oculto de listados y selectores, sin borrar nada. null = activo. */
    archivedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("projects_opportunity_uq")
      .on(t.opportunityId)
      .where(sql`${t.opportunityId} IS NOT NULL`),
    check("projects_estimated_hours_ck", sql`${t.estimatedHours} IS NULL OR ${t.estimatedHours} > 0`),
    check(
      "projects_dates_ck",
      sql`${t.startsOn} IS NULL OR ${t.dueOn} IS NULL OR ${t.dueOn} >= ${t.startsOn}`,
    ),
    index("projects_client_idx").on(t.clientId),
    index("projects_implementer_status_idx").on(t.implementerId, t.status),
    index("projects_status_idx").on(t.status),
    trgmIndex("projects_name_trgm", t.name),
  ],
);
