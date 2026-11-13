/**
 * Accesos de clientes (pantalla "Accesos").
 * La clave se guarda cifrada con AES-256-GCM en la app (packages/shared/crypto):
 * `secret_ciphertext` = base64(iv ‖ authTag ‖ ciphertext). La base nunca ve el texto plano.
 * `key_version` permite rotar la clave maestra sin descifrar todo de golpe.
 * Regla: los listados NO seleccionan `secret_ciphertext`; solo el endpoint de "ver/copiar",
 * que además escribe en `credential_access_logs`.
 */
import { sql } from "drizzle-orm";
import { index, inet, pgEnum, pgTable, smallint, text } from "drizzle-orm/pg-core";
import { createdAt, id, ref, timestamps, tstz } from "./_shared/columns";
import { clients } from "./clients";
import { users } from "./identity";

export const credentialKind = pgEnum("credential_kind", [
  "panel",
  "hosting",
  "base_de_datos",
  "acceso_remoto",
  "tienda_apps",
  "email",
  "red_social",
  "dominio",
  "otro",
]);
export const credentialAction = pgEnum("credential_action", [
  "ver",
  "copiar",
  "crear",
  "editar",
  "eliminar",
]);

export const credentials = pgTable(
  "credentials",
  {
    id: id(),
    clientId: ref()
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    kind: credentialKind().notNull(),
    /** Qué es ("PC recepción", "Panel del hosting"). */
    label: text().notNull(),
    username: text(),
    secretCiphertext: text().notNull(),
    keyVersion: smallint().notNull().default(1),
    /** URL o id para "Conectar" (AnyDesk, panel web…). */
    connectUrl: text(),
    notes: text(),
    createdById: ref().references(() => users.id, { onDelete: "set null" }),
    /** Borrado lógico: el acceso desaparece de la lista pero su historial queda. */
    deletedAt: tstz(),
    ...timestamps,
  },
  (t) => [index("credentials_client_idx").on(t.clientId).where(sql`${t.deletedAt} IS NULL`)],
);

/**
 * Auditoría append-only de quién vio/copió cada clave.
 * Crece rápido: si supera varios millones de filas, particionar por mes (created_at).
 */
export const credentialAccessLogs = pgTable(
  "credential_access_logs",
  {
    id: id(),
    credentialId: ref()
      .notNull()
      .references(() => credentials.id, { onDelete: "cascade" }),
    userId: ref()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    action: credentialAction().notNull(),
    ipAddress: inet(),
    userAgent: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index("credential_logs_credential_idx").on(t.credentialId, t.createdAt),
    index("credential_logs_user_idx").on(t.userId, t.createdAt),
    index("credential_logs_created_idx").on(t.createdAt),
  ],
);
