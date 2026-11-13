/**
 * Adjuntos ("Contenedor de archivos" del cliente, adjuntos de tickets y proyectos).
 * El binario vive en MinIO/S3; acá solo metadatos. Cada archivo pertenece a
 * exactamente un dueño (FKs reales en lugar de un polimórfico owner_type/owner_id,
 * así la base garantiza integridad y borra en cascada).
 */
import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { createdAt, id, ref } from "./_shared/columns";
import { clients } from "./clients";
import { users } from "./identity";
import { projects } from "./projects";
import { tickets } from "./support";

export const attachments = pgTable(
  "attachments",
  {
    id: id(),
    /** Clave del objeto en el bucket. */
    storageKey: text().notNull(),
    filename: text().notNull(),
    mimeType: text().notNull(),
    sizeBytes: bigint({ mode: "number" }).notNull(),
    clientId: ref().references(() => clients.id, { onDelete: "cascade" }),
    projectId: ref().references(() => projects.id, { onDelete: "cascade" }),
    ticketId: ref().references(() => tickets.id, { onDelete: "cascade" }),
    uploadedById: ref().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("attachments_storage_key_uq").on(t.storageKey),
    check("attachments_one_owner_ck", sql`num_nonnulls(${t.clientId}, ${t.projectId}, ${t.ticketId}) = 1`),
    check("attachments_size_ck", sql`${t.sizeBytes} >= 0`),
    index("attachments_client_idx").on(t.clientId).where(sql`${t.clientId} IS NOT NULL`),
    index("attachments_project_idx").on(t.projectId).where(sql`${t.projectId} IS NOT NULL`),
    index("attachments_ticket_idx").on(t.ticketId).where(sql`${t.ticketId} IS NOT NULL`),
  ],
);
