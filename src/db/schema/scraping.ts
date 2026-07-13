import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { contacts } from "./contacts"
import { users } from "./users"

export const CAMPAIGN_STATES = ["pendiente", "corriendo", "completada", "error"] as const
export type CampaignState = (typeof CAMPAIGN_STATES)[number]

export const scrapingCampaigns = sqliteTable("scraping_campaigns", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  nombre: text("nombre").notNull(),
  query: text("query").notNull(),
  ubicacion: text("ubicacion"),
  cantidad: integer("cantidad").notNull().default(20),
  camposExtra: text("campos_extra", { mode: "json" }),
  estado: text("estado").notNull().default("pendiente").$type<CampaignState>(),
  createdBy: text("created_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
})

export const LEAD_STATES = ["nuevo", "aprobado", "descartado", "duplicado"] as const
export type LeadState = (typeof LEAD_STATES)[number]

/** Bandeja de revisión: leads scrapeados antes de entrar al pipeline (§3). */
export const scrapingLeads = sqliteTable(
  "scraping_leads",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => scrapingCampaigns.id, { onDelete: "cascade" }),
    nombre: text("nombre").notNull(),
    email: text("email"),
    telefono: text("telefono"),
    contactoNombre: text("contacto_nombre"),
    contactoArea: text("contacto_area"),
    sitioWeb: text("sitio_web"),
    descripcion: text("descripcion"),
    datosExtra: text("datos_extra", { mode: "json" }),
    estado: text("estado").notNull().default("nuevo").$type<LeadState>(),
    contactId: text("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("scraping_leads_campaign_idx").on(t.campaignId),
    index("scraping_leads_estado_idx").on(t.estado),
  ],
)

export type ScrapingCampaign = typeof scrapingCampaigns.$inferSelect
export type ScrapingLead = typeof scrapingLeads.$inferSelect
