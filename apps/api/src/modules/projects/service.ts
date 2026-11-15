/** Reglas de Proyectos: alta manual y edición (etapa, estado, fechas, responsable). */
import { activities, type Db, eq, projects, sql } from "@crm/db";
import {
  type ProjectCreate,
  type ProjectDetail,
  type ProjectUpdate,
  PROJECT_PHASES,
  projectCreate,
  projectUpdate,
} from "@crm/shared";
import { archivedChange } from "../../lib/archive";
import { BadRequestError, NotFoundError } from "../../lib/errors";
import { redactAmounts } from "../../lib/money";

/** "$ 250.000" o "$ 1.500,50"; "sin monto" si no hay. Sin acceso a Finanzas la actividad lo tapa (redactAmounts). */
const pesos = (cents: number | null | undefined) =>
  cents == null
    ? "sin monto"
    : new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
        minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
        maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
      }).format(cents / 100);
import { isActiveUser } from "../tasks/repository";
import * as repo from "./repository";

const PHASE_LABEL = ["Kickoff", "Relevamiento", "Desarrollo", "Pruebas", "Entrega"];

export const listProjects = (db: Db, opts: { archived?: boolean } = {}) => repo.listProjects(db, opts);

/** Sin acceso a Finanzas no viajan el monto ni la forma de pago, y los montos de las tareas van tapados. */
export async function getProject(db: Db, id: string, { money }: { money: boolean }): Promise<ProjectDetail> {
  const p = await repo.getProjectDetail(db, id);
  if (!p) throw new NotFoundError("Proyecto");
  if (money) return p;
  return {
    ...p,
    sale: { ...p.sale, amount: null, paymentTerms: null },
    tasks: p.tasks.map((t) => ({ ...t, title: redactAmounts(t.title) })),
  };
}

async function checkImplementer(db: Db, id: string | null | undefined) {
  if (id && !(await isActiveUser(db, id))) throw new BadRequestError("El implementador no existe o está inactivo");
}

export async function createProject(db: Db, actorId: string, input: ProjectCreate) {
  const data = projectCreate.parse(input);
  await checkImplementer(db, data.implementerId);
  const [client] = await db.execute(sql`select 1 from clients where id = ${data.clientId}`);
  if (!client) throw new BadRequestError("El cliente no existe");

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(projects)
      .values({
        ...data,
        implementerId: data.implementerId ?? null,
        status: "nuevo",
        phase: "kickoff",
        sellerId: data.saleAmount ? actorId : null,
      })
      .returning({ id: projects.id });
    if (!row) throw new Error("No se pudo crear el proyecto");
    await tx.insert(activities).values({
      clientId: data.clientId,
      actorId,
      projectId: row.id,
      kind: "sistema",
      title: `Proyecto creado: ${data.name}`,
    });
    return row;
  });
}

export async function updateProject(db: Db, actorId: string, id: string, input: ProjectUpdate) {
  const data = projectUpdate.parse(input);
  const before = await repo.getProjectDetail(db, id);
  if (!before) throw new NotFoundError("Proyecto");
  await checkImplementer(db, data.implementerId);

  const startsOn = data.startsOn === undefined ? before.startsOn : data.startsOn;
  const dueOn = data.dueOn === undefined ? before.dueOn : data.dueOn;
  if (startsOn && dueOn && dueOn < startsOn) throw new BadRequestError("La entrega no puede ser antes del inicio");

  // Avanzar de etapa saca al proyecto de "nuevo"; llegar a entregado lo deja en la última etapa.
  // Zod deja las claves ausentes como undefined; al UPDATE van solo las presentes.
  const { archived, ...fields } = data;
  const patch = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) as Partial<
    typeof projects.$inferInsert
  >;
  patch.updatedAt = new Date();
  // Baja lógica: no se borra nada (tickets, facturas y cobros quedan como estaban).
  const archiveChange = archivedChange(before.archivedAt, archived);
  if (archiveChange) patch.archivedAt = archiveChange === "baja" ? new Date() : null;
  if (data.phase && data.phase !== "kickoff" && before.status === "nuevo" && !data.status) patch.status = "en_curso";
  if (data.status === "entregado") patch.phase = "entrega";

  await db.transaction(async (tx) => {
    await tx.update(projects).set(patch).where(eq(projects.id, id));
    const notes: string[] = [];
    if (patch.phase && patch.phase !== before.phase) notes.push(`Etapa: ${PHASE_LABEL[PROJECT_PHASES.indexOf(patch.phase)]}`);
    if (data.status === "entregado" && before.status !== "entregado") notes.push("Proyecto entregado");
    // Cambiar lo que se vendió queda registrado (con quién lo cambió, en la actividad del cliente).
    if (data.saleAmount !== undefined && data.saleAmount !== before.sale.amount) {
      notes.push(`Monto de la venta: ${pesos(before.sale.amount)} → ${pesos(data.saleAmount)}`);
    }
    if (archiveChange === "baja") notes.push("Proyecto dado de baja");
    if (archiveChange === "reactivado") notes.push("Proyecto reactivado");
    for (const title of notes) {
      await tx.insert(activities).values({ clientId: before.client.id, actorId, projectId: id, kind: "sistema", title: `${before.name} · ${title}` });
    }
  });
}
