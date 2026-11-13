/**
 * Embudo de ventas. Las etapas son configurables; cada movimiento de etapa
 * queda en `opportunity_stage_changes` ("Movimientos automáticos de hoy").
 * Al ganar, el servicio crea el proyecto (projects.opportunity_id) y el plan de cuotas.
 */
import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  pgEnum,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { createdAt, id, money, ref, timestamps, tstz } from "./_shared/columns";
import { clientContacts, clients } from "./clients";
import { users } from "./identity";

export const opportunityStatus = pgEnum("opportunity_status", ["abierta", "ganada", "perdida"]);

/**
 * Identidad estable de cada etapa: las automatizaciones mueven por clave, así
 * el nombre visible se puede cambiar sin romper las reglas.
 */
export const pipelineStageKey = pgEnum("pipeline_stage_key", [
  "potencial",
  "primer_contacto",
  "reunion",
  "propuesta",
  "seguimiento",
  "cierre",
  "implementacion",
]);

export const pipelineStages = pgTable(
  "pipeline_stages",
  {
    id: id(),
    key: pipelineStageKey().notNull(),
    name: text().notNull(),
    /** Regla que se muestra bajo el nombre ("Llamada marcada hecha"). */
    description: text(),
    color: varchar({ length: 7 }).notNull(),
    position: smallint().notNull(),
    /** Etapa terminal: al entrar, la oportunidad pasa a ese estado. */
    closesAs: opportunityStatus(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("pipeline_stages_position_uq").on(t.position),
    uniqueIndex("pipeline_stages_name_uq").on(t.name),
    uniqueIndex("pipeline_stages_key_uq").on(t.key),
  ],
);

export const opportunities = pgTable(
  "opportunities",
  {
    id: id(),
    clientId: ref()
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    contactId: ref().references(() => clientContacts.id, { onDelete: "set null" }),
    /** Qué se vende ("App de reservas"). */
    title: text().notNull(),
    amount: money().notNull().default(0),
    stageId: ref()
      .notNull()
      .references(() => pipelineStages.id, { onDelete: "restrict" }),
    status: opportunityStatus().notNull().default("abierta"),
    ownerId: ref().references(() => users.id, { onDelete: "set null" }),
    /** Para "N días en la etapa" y alertas de estancamiento sin recorrer el historial. */
    stageEnteredAt: tstz().notNull().defaultNow(),
    expectedCloseOn: date({ mode: "string" }),
    closedAt: tstz(),
    lostReason: text(),
    ...timestamps,
  },
  (t) => [
    check("opportunities_amount_ck", sql`${t.amount} >= 0`),
    index("opportunities_open_stage_idx")
      .on(t.stageId, t.stageEnteredAt)
      .where(sql`${t.status} = 'abierta'`),
    index("opportunities_client_idx").on(t.clientId),
    index("opportunities_owner_idx").on(t.ownerId),
  ],
);

export const opportunityStageChanges = pgTable(
  "opportunity_stage_changes",
  {
    id: id(),
    opportunityId: ref()
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    fromStageId: ref().references(() => pipelineStages.id, { onDelete: "set null" }),
    toStageId: ref()
      .notNull()
      .references(() => pipelineStages.id, { onDelete: "restrict" }),
    /** Motivo legible ("llamada marcada hecha en Mi día"). */
    reason: text(),
    /** null = lo movió una automatización. */
    changedById: ref().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("opp_stage_changes_opp_idx").on(t.opportunityId, t.createdAt),
    index("opp_stage_changes_created_idx").on(t.createdAt),
  ],
);
