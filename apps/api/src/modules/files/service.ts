/**
 * Contenedor de archivos: cada archivo es de un cliente, un proyecto o un ticket.
 * La ficha del cliente muestra también los de sus proyectos y tickets, y la del
 * proyecto los de sus tickets (cada uno marcado con de qué es).
 */
import { attachments, type DbOrTx, sql, ticketEvents } from "@crm/db";
import { cleanFilename, type FileDto, type FileOwnerKind, type FileOwnerQuery } from "@crm/shared";
import type { Readable } from "node:stream";
import { NotFoundError } from "../../lib/errors";
import { removeFile, saveFile } from "../../lib/storage";

export interface Viewer {
  id: string;
  isAdmin: boolean;
  /** De qué dueños puede ver archivos (según sus permisos de Clientes, Proyectos y Tickets). */
  sees: Record<FileOwnerKind, boolean>;
}

interface Row extends Record<string, unknown> {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: string | number;
  created_at: Date | string;
  uploaded_by_id: string | null;
  uploaded_by_name: string | null;
  owner_kind: FileOwnerKind;
  owner_id: string;
  owner_name: string;
  /** Solo para leer/borrar del disco: nunca sale en la respuesta. */
  storage_key: string;
}

const SELECT = sql`
  select a.id, a.storage_key, a.filename, a.mime_type, a.size_bytes, a.created_at,
         u.id as uploaded_by_id, u.name as uploaded_by_name,
         case when a.client_id is not null then 'client' when a.project_id is not null then 'project' else 'ticket' end as owner_kind,
         coalesce(a.client_id, a.project_id, a.ticket_id) as owner_id,
         coalesce(c.name, p.name, '#' || t.number || ' · ' || t.title) as owner_name
  from attachments a
  left join users u on u.id = a.uploaded_by_id
  left join clients c on c.id = a.client_id
  left join projects p on p.id = a.project_id
  left join tickets t on t.id = a.ticket_id`;

const toDto = (r: Row, viewer: Viewer): FileDto => ({
  id: r.id,
  filename: r.filename,
  mimeType: r.mime_type,
  sizeBytes: Number(r.size_bytes),
  createdAt: new Date(r.created_at).toISOString(),
  uploadedBy: r.uploaded_by_id && r.uploaded_by_name ? { id: r.uploaded_by_id, name: r.uploaded_by_name } : null,
  owner: { kind: r.owner_kind, id: r.owner_id, name: r.owner_name },
  canDelete: viewer.isAdmin || r.uploaded_by_id === viewer.id,
});

export const ownerOf = (q: FileOwnerQuery): { kind: FileOwnerKind; id: string } =>
  q.clientId ? { kind: "client", id: q.clientId } : q.projectId ? { kind: "project", id: q.projectId } : { kind: "ticket", id: q.ticketId as string };

export async function listFiles(db: DbOrTx, viewer: Viewer, q: FileOwnerQuery): Promise<FileDto[]> {
  const owner = ownerOf(q);
  await requireOwner(db, owner.kind, owner.id);
  const projects = viewer.sees.project;
  const tickets = viewer.sees.ticket;
  const where =
    owner.kind === "client"
      ? sql`a.client_id = ${owner.id}
          ${projects ? sql`or a.project_id in (select id from projects where client_id = ${owner.id})` : sql``}
          ${tickets ? sql`or a.ticket_id in (select id from tickets where client_id = ${owner.id})` : sql``}`
      : owner.kind === "project"
        ? sql`a.project_id = ${owner.id}
            ${tickets ? sql`or a.ticket_id in (select id from tickets where project_id = ${owner.id})` : sql``}`
        : sql`a.ticket_id = ${owner.id}`;
  const rows = await db.execute<Row>(sql`${SELECT} where ${where} order by a.created_at desc`);
  return rows.map((r) => toDto(r, viewer));
}

export async function getFile(db: DbOrTx, id: string) {
  const [row] = await db.execute<Row>(sql`${SELECT} where a.id = ${id}`);
  if (!row) throw new NotFoundError("Archivo");
  return row;
}

const TABLE: Record<FileOwnerKind, ReturnType<typeof sql.raw>> = {
  client: sql.raw("clients"),
  project: sql.raw("projects"),
  ticket: sql.raw("tickets"),
};
const WHAT: Record<FileOwnerKind, string> = { client: "Cliente", project: "Proyecto", ticket: "Ticket" };

async function requireOwner(db: DbOrTx, kind: FileOwnerKind, id: string) {
  const [row] = await db.execute(sql`select 1 from ${TABLE[kind]} where id = ${id}`);
  if (!row) throw new NotFoundError(WHAT[kind]);
}

export async function uploadFile(
  db: DbOrTx,
  viewer: Viewer,
  q: FileOwnerQuery,
  file: { filename: string; mimetype: string; file: Readable & { truncated?: boolean } },
): Promise<FileDto> {
  const owner = ownerOf(q);
  await requireOwner(db, owner.kind, owner.id);
  const saved = await saveFile(file.file);
  const filename = cleanFilename(file.filename);
  try {
    const [row] = await db
      .insert(attachments)
      .values({
        storageKey: saved.key,
        filename,
        mimeType: (file.mimetype || "application/octet-stream").slice(0, 120),
        sizeBytes: saved.size,
        clientId: owner.kind === "client" ? owner.id : null,
        projectId: owner.kind === "project" ? owner.id : null,
        ticketId: owner.kind === "ticket" ? owner.id : null,
        uploadedById: viewer.id,
      })
      .returning({ id: attachments.id });
    if (owner.kind === "ticket") {
      await db.insert(ticketEvents).values({ ticketId: owner.id, actorId: viewer.id, kind: "adjunto", message: `Subió el archivo "${filename}".` });
    }
    const [dto] = await db.execute<Row>(sql`${SELECT} where a.id = ${row?.id}`);
    return toDto(dto as Row, viewer);
  } catch (err) {
    await removeFile(saved.key);
    throw err;
  }
}

export async function deleteFile(db: DbOrTx, viewer: Viewer, id: string) {
  const row = await getFile(db, id);
  await db.execute(sql`delete from attachments where id = ${id}`);
  if (row.owner_kind === "ticket") {
    await db.insert(ticketEvents).values({ ticketId: row.owner_id, actorId: viewer.id, kind: "adjunto", message: `Borró el archivo "${row.filename}".` });
  }
  await removeFile(row.storage_key);
}
