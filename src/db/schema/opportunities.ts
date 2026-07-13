import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { contacts } from "./contacts"

/**
 * Estados del pipeline (§3). "pendiente" = presupuesto enviado, esperando respuesta.
 * El orden define las columnas del kanban.
 */
export const OPPORTUNITY_STATES = [
  "consultado",
  "posible",
  "pendiente",
  "confirmado",
  "en_desarrollo",
  "finalizado",
  "perdido",
] as const

export type OpportunityState = (typeof OPPORTUNITY_STATES)[number]

/**
 * Oportunidad: lo que se mueve por el pipeline. El pipeline mide *negocios*,
 * no personas. `estado_cambiado_at` permite medir tiempo por etapa.
 */
export const opportunities = sqliteTable(
  "opportunities",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    titulo: text("titulo").notNull(),
    estado: text("estado").notNull().default("consultado").$type<OpportunityState>(),
    motivoPerdida: text("motivo_perdida"),
    valorEstimado: text("valor_estimado"),
    probabilidad: text("probabilidad"),
    moneda: text("moneda").notNull().default("ARS"),
    // Se completa en Fase 4; se deja previsto para no migrar (§7).
    scrapingCampaignId: text("scraping_campaign_id"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    estadoCambiadoAt: integer("estado_cambiado_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("opportunities_estado_idx").on(t.estado),
    index("opportunities_contact_idx").on(t.contactId),
  ],
)

export type Opportunity = typeof opportunities.$inferSelect
export type NewOpportunity = typeof opportunities.$inferInsert
