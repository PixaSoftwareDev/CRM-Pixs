import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { projects } from "./projects"

/**
 * Bóveda de accesos: usuarios, contraseñas/tokens y URLs de lo que tenemos
 * levantado. El secreto se guarda CIFRADO (libsodium, src/lib/crypto.ts), nunca
 * en texto plano, y nunca viaja al cliente salvo en un "mostrar" puntual (§4.1).
 */
export const CREDENTIAL_TYPES = ["servidor", "base", "servicio", "web", "email", "otro"] as const
export type CredentialType = (typeof CREDENTIAL_TYPES)[number]

export const credentials = sqliteTable(
  "credentials",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    titulo: text("titulo").notNull(),
    tipo: text("tipo").notNull().default("otro").$type<CredentialType>(),
    usuario: text("usuario"),
    // Secreto cifrado ("nonce.ciphertext" base64). Nunca en claro.
    secretoCifrado: text("secreto_cifrado"),
    url: text("url"),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    notas: text("notas"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("credentials_project_idx").on(t.projectId),
    index("credentials_tipo_idx").on(t.tipo),
  ],
)

export type Credential = typeof credentials.$inferSelect
export type NewCredential = typeof credentials.$inferInsert
