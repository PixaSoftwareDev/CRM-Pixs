/**
 * Accesos de clientes. Reglas:
 *  - Los listados nunca leen `secret_ciphertext`.
 *  - La única forma de leer una clave es `reveal`, que deja registro (quién, cuándo, IP).
 *  - Crear, editar y borrar también quedan en el historial.
 *  - Borrar es lógico: el historial de un acceso borrado se conserva.
 */
import { credentialAccessLogs, credentials, type Db, type DbOrTx, eq, sql } from "@crm/db";
import {
  type AccessLogDto,
  type AccessLogQuery,
  accessLogQuery,
  type CredentialCreate,
  type CredentialDto,
  type CredentialKind,
  type CredentialReveal,
  type CredentialUpdate,
  credentialCreate,
  credentialReveal,
  credentialUpdate,
} from "@crm/shared";
import { likePattern, matches } from "../../lib/cursor";
import { BadRequestError, NotFoundError } from "../../lib/errors";
import { toIso } from "../../lib/sql";
import { decryptSecret, encryptSecret } from "../../lib/vault";

type Action = "ver" | "copiar" | "crear" | "editar" | "eliminar";

/** Quién y desde dónde (para el historial). */
export interface Audit {
  userId: string;
  ip: string | null;
  userAgent: string | null;
}

const log = (db: DbOrTx, credentialId: string, a: Audit, action: Action) =>
  db.insert(credentialAccessLogs).values({
    credentialId,
    userId: a.userId,
    action,
    ipAddress: a.ip,
    userAgent: a.userAgent?.slice(0, 300) ?? null,
  });

async function requireCredential(db: DbOrTx, id: string) {
  const [row] = await db
    .select({ id: credentials.id, ciphertext: credentials.secretCiphertext, keyVersion: credentials.keyVersion })
    .from(credentials)
    .where(sql`${credentials.id} = ${id} and ${credentials.deletedAt} is null`);
  if (!row) throw new NotFoundError("Acceso");
  return row;
}

const blankToNull = (v: string | undefined) => (v === undefined ? undefined : v.trim() || null);

// ─── Lecturas ───────────────────────────────────────────────────────────────

export async function listCredentials(db: Db, q?: string): Promise<CredentialDto[]> {
  const like = q ? likePattern(q) : null;
  const rows = await db.execute<{
    id: string;
    client_id: string;
    client_name: string;
    kind: CredentialKind;
    label: string;
    username: string | null;
    connect_url: string | null;
    notes: string | null;
    last_used_at: Date | null;
    updated_at: Date;
  }>(sql`
    select cr.id, c.id as client_id, c.name as client_name, cr.kind, cr.label, cr.username,
           cr.connect_url, cr.notes, cr.updated_at,
           (select max(l.created_at) from credential_access_logs l
             where l.credential_id = cr.id and l.action in ('ver', 'copiar')) as last_used_at
    from credentials cr join clients c on c.id = cr.client_id
    where cr.deleted_at is null
      ${like ? sql`and (${matches(sql`c.name`, like)} or ${matches(sql`cr.label`, like)} or ${matches(sql`cr.kind`, like)} or ${matches(sql`cr.username`, like)})` : sql``}
    order by c.name, cr.label
    limit 2000`);
  return rows.map((r) => ({
    id: r.id,
    client: { id: r.client_id, name: r.client_name },
    kind: r.kind,
    label: r.label,
    username: r.username,
    connectUrl: r.connect_url,
    notes: r.notes,
    lastUsedAt: r.last_used_at ? toIso(r.last_used_at) : null,
    updatedAt: toIso(r.updated_at),
  }));
}

export async function listAccessLogs(db: Db, input: AccessLogQuery): Promise<AccessLogDto[]> {
  const q = accessLogQuery.parse(input);
  const like = q.q ? likePattern(q.q) : null;
  const AR = "America/Argentina/Buenos_Aires";
  const rows = await db.execute<{
    id: string;
    created_at: Date;
    user_id: string;
    user_name: string;
    action: Action;
    label: string;
    client_id: string;
    client_name: string;
    ip_address: string | null;
  }>(sql`
    select l.id, l.created_at, u.id as user_id, u.name as user_name, l.action, cr.label,
           c.id as client_id, c.name as client_name, host(l.ip_address) as ip_address
    from credential_access_logs l
    join users u on u.id = l.user_id
    join credentials cr on cr.id = l.credential_id
    join clients c on c.id = cr.client_id
    where true
      ${q.from ? sql`and (l.created_at at time zone ${AR})::date >= ${q.from}` : sql``}
      ${q.to ? sql`and (l.created_at at time zone ${AR})::date <= ${q.to}` : sql``}
      ${q.clientId ? sql`and c.id = ${q.clientId}` : sql``}
      ${q.userId ? sql`and u.id = ${q.userId}` : sql``}
      ${like ? sql`and (${matches(sql`cr.label`, like)} or ${matches(sql`c.name`, like)} or ${matches(sql`u.name`, like)})` : sql``}
    order by l.created_at desc
    limit ${q.limit}`);
  return rows.map((r) => ({
    id: r.id,
    at: toIso(r.created_at),
    user: { id: r.user_id, name: r.user_name },
    action: r.action,
    credentialLabel: r.label,
    client: { id: r.client_id, name: r.client_name },
    ipAddress: r.ip_address,
  }));
}

// ─── Escrituras ─────────────────────────────────────────────────────────────

export async function createCredential(db: Db, audit: Audit, input: CredentialCreate) {
  const data = credentialCreate.parse(input);
  const [client] = await db.execute(sql`select 1 from clients where id = ${data.clientId}`);
  if (!client) throw new BadRequestError("El cliente no existe");
  const { ciphertext, keyVersion } = encryptSecret(data.secret);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(credentials)
      .values({
        clientId: data.clientId,
        kind: data.kind,
        label: data.label,
        username: blankToNull(data.username) ?? null,
        secretCiphertext: ciphertext,
        keyVersion,
        connectUrl: blankToNull(data.connectUrl) ?? null,
        notes: blankToNull(data.notes) ?? null,
        createdById: audit.userId,
      })
      .returning({ id: credentials.id });
    if (!row) throw new Error("No se pudo guardar el acceso");
    await log(tx, row.id, audit, "crear");
    return row;
  });
}

export async function updateCredential(db: Db, audit: Audit, id: string, input: CredentialUpdate) {
  const data = credentialUpdate.parse(input);
  await requireCredential(db, id);
  const patch: Partial<typeof credentials.$inferInsert> = { updatedAt: new Date() };
  if (data.kind !== undefined) patch.kind = data.kind;
  if (data.label !== undefined) patch.label = data.label;
  if (data.username !== undefined) patch.username = blankToNull(data.username) ?? null;
  if (data.connectUrl !== undefined) patch.connectUrl = blankToNull(data.connectUrl) ?? null;
  if (data.notes !== undefined) patch.notes = blankToNull(data.notes) ?? null;
  if (data.secret !== undefined) {
    const enc = encryptSecret(data.secret);
    patch.secretCiphertext = enc.ciphertext;
    patch.keyVersion = enc.keyVersion;
  }
  await db.transaction(async (tx) => {
    await tx.update(credentials).set(patch).where(eq(credentials.id, id));
    await log(tx, id, audit, "editar");
  });
}

export async function deleteCredential(db: Db, audit: Audit, id: string) {
  await requireCredential(db, id);
  await db.transaction(async (tx) => {
    await tx.update(credentials).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(credentials.id, id));
    await log(tx, id, audit, "eliminar");
  });
}

/** La única puerta a una clave en texto plano: siempre deja registro antes de devolverla. */
export async function revealCredential(db: Db, audit: Audit, id: string, input: CredentialReveal) {
  const { action } = credentialReveal.parse(input);
  const cred = await requireCredential(db, id);
  const secret = decryptSecret(cred.ciphertext, cred.keyVersion);
  await log(db, id, audit, action);
  return { secret };
}
