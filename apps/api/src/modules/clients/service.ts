/**
 * Reglas de negocio de Clientes. Cada operación que cambia datos corre en una
 * transacción y deja su rastro en la línea de tiempo del cliente.
 */
import {
  activities,
  and,
  clientBillingProfiles,
  clientContacts,
  clients,
  type Db,
  type DbOrTx,
  eq,
} from "@crm/db";
import {
  type ActivityCreate,
  type ActivityDto,
  type ClientDetail,
  type ClientListItem,
  type ClientListQuery,
  activityCreate,
  type BillingProfileInput,
  billingProfileInput,
  type ClientCreate,
  type ClientStatus,
  type ClientStatusChange,
  type ClientUpdate,
  clientCreate,
  clientStatusChange,
  clientUpdate,
  type ContactInput,
  type ContactUpdate,
  contactInput,
  contactUpdate,
} from "@crm/shared";
import { ConflictError, isUniqueViolation, NotFoundError } from "../../lib/errors";
import { FINANCE_ACTIVITY_KINDS, redactAmounts } from "../../lib/money";
import * as repo from "./repository";

const STATUS_LABEL: Record<ClientStatus, string> = {
  potencial: "Potencial",
  activo: "Activo",
  en_riesgo: "En riesgo",
  baja: "Baja",
};

/** Traduce el CUIT duplicado a un mensaje entendible. */
async function guardTaxId<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (err) {
    if (isUniqueViolation(err, "clients_tax_id_uq")) {
      throw new ConflictError("Ya existe un cliente con ese CUIT");
    }
    throw err;
  }
}

async function requireClient(db: DbOrTx, id: string) {
  const client = await repo.findClient(db, id);
  if (!client) throw new NotFoundError("Cliente");
  return client;
}

function logSystem(db: DbOrTx, clientId: string, actorId: string, title: string, body?: string | null) {
  return db.insert(activities).values({ clientId, actorId, kind: "sistema", title, body: body ?? null });
}

// ─── Clientes ───────────────────────────────────────────────────────────────

export function createClient(db: Db, actorId: string, input: ClientCreate) {
  const data = clientCreate.parse(input);
  return guardTaxId(() =>
    db.transaction(async (tx) => {
      const [client] = await tx
        .insert(clients)
        .values({ ...data, ownerId: data.ownerId ?? actorId })
        .returning({ id: clients.id });
      if (!client) throw new Error("No se pudo crear el cliente");
      await logSystem(tx, client.id, actorId, "Cliente creado");
      return client;
    }),
  );
}

export async function updateClient(db: Db, id: string, input: ClientUpdate) {
  const data = clientUpdate.parse(input);
  await requireClient(db, id);
  if (Object.keys(data).length === 0) return;
  await guardTaxId(() => db.update(clients).set(data).where(eq(clients.id, id)));
}

export async function changeStatus(db: Db, actorId: string, id: string, input: ClientStatusChange) {
  const { status, reason } = clientStatusChange.parse(input);

  await db.transaction(async (tx) => {
    const client = await requireClient(tx, id);
    if (client.status === status && client.statusReason === (reason ?? null)) return;

    await tx
      .update(clients)
      .set({ status, statusReason: reason ?? null, statusChangedAt: new Date() })
      .where(eq(clients.id, id));

    await logSystem(
      tx,
      id,
      actorId,
      `Estado: ${STATUS_LABEL[client.status]} → ${STATUS_LABEL[status]}`,
      reason,
    );
  });
}

// ─── Personas ───────────────────────────────────────────────────────────────

export async function addContact(db: Db, clientId: string, input: ContactInput) {
  const data = contactInput.parse(input);
  await requireClient(db, clientId);
  const [row] = await db
    .insert(clientContacts)
    .values({ ...data, clientId })
    .returning({ id: clientContacts.id });
  return row;
}

export async function updateContact(db: Db, clientId: string, contactId: string, input: ContactUpdate) {
  const data = contactUpdate.parse(input);
  if (Object.keys(data).length === 0) return;
  const updated = await db
    .update(clientContacts)
    .set(data)
    .where(and(eq(clientContacts.id, contactId), eq(clientContacts.clientId, clientId)))
    .returning({ id: clientContacts.id });
  if (updated.length === 0) throw new NotFoundError("Contacto");
}

export async function removeContact(db: Db, clientId: string, contactId: string) {
  const deleted = await db
    .delete(clientContacts)
    .where(and(eq(clientContacts.id, contactId), eq(clientContacts.clientId, clientId)))
    .returning({ id: clientContacts.id });
  if (deleted.length === 0) throw new NotFoundError("Contacto");
}

// ─── Facturación ────────────────────────────────────────────────────────────

export async function saveBillingProfile(db: Db, clientId: string, input: BillingProfileInput) {
  const data = billingProfileInput.parse(input);
  await requireClient(db, clientId);
  await db
    .insert(clientBillingProfiles)
    .values({ ...data, clientId })
    .onConflictDoUpdate({ target: clientBillingProfiles.clientId, set: data });
}

// ─── Actividad ──────────────────────────────────────────────────────────────

const KIND_TITLE: Record<ActivityCreate["kind"], string> = {
  nota: "Nota",
  llamada: "Llamada",
  reunion: "Reunión",
  whatsapp: "WhatsApp",
  email: "Email",
};

export async function addActivity(db: Db, actorId: string, clientId: string, input: ActivityCreate) {
  const { kind, body } = activityCreate.parse(input);
  await requireClient(db, clientId);
  const [row] = await db
    .insert(activities)
    .values({ clientId, actorId, kind, title: KIND_TITLE[kind], body })
    .returning({ id: activities.id });
  return row;
}

// ─── Lecturas ───────────────────────────────────────────────────────────────

/** Qué puede ver quien consulta: sin acceso a Finanzas no viaja ningún monto. */
export interface Visibility {
  money: boolean;
}

export async function getClient(db: Db, id: string, { money }: Visibility): Promise<ClientDetail> {
  const detail = await repo.getClientDetail(db, id);
  if (!detail) throw new NotFoundError("Cliente");
  if (money) return detail;
  return { ...detail, summary: { ...detail.summary, balance: null, hasOverdueDebt: null, overdueAmount: null, monthlySubscriptions: null } };
}

export async function listClients(db: Db, query: ClientListQuery, { money }: Visibility) {
  const page = await repo.listClients(db, query);
  if (money) return page;
  return {
    ...page,
    items: page.items.map(
      (c): ClientListItem => ({
        ...c,
        balance: null,
        hasOverdueDebt: null,
        nextTask: c.nextTask && { ...c.nextTask, title: redactAmounts(c.nextTask.title) },
      }),
    ),
  };
}

export { countClients, listClientOptions } from "./repository";

/** Sin Finanzas, la actividad no trae cobros ni facturas, y los montos sueltos (tareas de cobranza…) van tapados. */
export async function getActivities(db: Db, id: string, page: { cursor?: string | undefined; limit: number }, { money }: Visibility) {
  await requireClient(db, id);
  const result = await repo.listActivities(db, id, { ...page, ...(!money && { excludeKinds: FINANCE_ACTIVITY_KINDS }) });
  if (money) return result;
  return {
    ...result,
    items: result.items.map((a): ActivityDto => ({ ...a, title: redactAmounts(a.title), body: redactAmounts(a.body) })),
  };
}

export async function getTasks(db: Db, id: string, { money }: Visibility) {
  await requireClient(db, id);
  const tasks = await repo.listClientTasks(db, id);
  return money ? tasks : tasks.map((t) => ({ ...t, title: redactAmounts(t.title) }));
}

export async function getStatement(db: Db, id: string, range: { from?: string | undefined; to?: string | undefined }) {
  await requireClient(db, id);
  return repo.getStatement(db, id, range);
}

export async function getProjects(db: Db, id: string) {
  await requireClient(db, id);
  return repo.listClientProjects(db, id);
}
