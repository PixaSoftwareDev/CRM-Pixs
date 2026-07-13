import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { projects } from "./projects"

/**
 * Inventario de infraestructura compartida (no por proyecto) — §3.
 * En modo demo (SQLite) el full-text (tsvector/GIN) se omite; la búsqueda
 * cae a LIKE en las queries.
 */
export const SERVER_STATES = ["activo", "baja", "caido"] as const

export const servers = sqliteTable(
  "servers",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    nombre: text("nombre").notNull(),
    proveedor: text("proveedor"),
    ipHostname: text("ip_hostname"),
    specs: text("specs"),
    os: text("os"),
    costoMensual: text("costo_mensual"),
    estado: text("estado").notNull().default("activo"),
    renovacionAt: integer("renovacion_at", { mode: "timestamp" }),
    descripcion: text("descripcion"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("servers_nombre_idx").on(t.nombre)],
)

export const databases = sqliteTable(
  "databases",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    nombre: text("nombre").notNull(),
    motor: text("motor").notNull().default("postgres"), // postgres | mysql | mongo...
    serverId: text("server_id").references(() => servers.id, { onDelete: "set null" }),
    host: text("host"),
    puerto: text("puerto"),
    entorno: text("entorno").notNull().default("prod"), // prod | staging | dev
    // Referencia al gestor de secretos (Bitwarden/1Password), NUNCA el secreto (§4.1).
    credencialRef: text("credencial_ref"),
    descripcion: text("descripcion"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("databases_nombre_idx").on(t.nombre)],
)

/** Relación N:N: un server sirve a varios proyectos. */
export const projectInfra = sqliteTable(
  "project_infra",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    serverId: text("server_id").references(() => servers.id, { onDelete: "cascade" }),
    databaseId: text("database_id").references(() => databases.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.serverId, t.databaseId] })],
)

/** Info técnica NO secreta del proyecto (repos, dominios, deploys, docs). */
export const projectTechInfo = sqliteTable(
  "project_tech_info",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull(), // repo | dominio | deploy | doc | link
    label: text("label").notNull(),
    valor: text("valor").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("project_tech_info_project_idx").on(t.projectId)],
)

export type Server = typeof servers.$inferSelect
export type Database = typeof databases.$inferSelect
export type ProjectTechInfo = typeof projectTechInfo.$inferSelect
