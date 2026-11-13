/**
 * Acciones explícitas del Embudo. Ganar una venta es la más importante: en una
 * sola transacción cierra la oportunidad, crea el proyecto con la foto de la
 * venta, activa al cliente y agenda el kickoff al implementador.
 */
import {
  activities,
  clientContacts,
  clients,
  type Db,
  type DbOrTx,
  eq,
  opportunities,
  opportunityStageChanges,
  projects,
  sql,
  tasks,
} from "@crm/db";
import {
  type OpportunityCreate,
  type OpportunityLose,
  type OpportunityMove,
  type OpportunityWin,
  opportunityCreate,
  opportunityLose,
  opportunityMove,
  opportunityWin,
} from "@crm/shared";
import { BadRequestError, ConflictError, NotFoundError } from "../../lib/errors";
import { todayAr } from "../../lib/sql";
import { isRuleEnabled, recordRun } from "../automations/service";
import { isActiveUser, listTaskTypes } from "../tasks/repository";
import { moveToStage } from "./automation";
import * as repo from "./repository";

export { getPipeline, listStageOpportunities } from "./repository";

async function requireOpen(db: DbOrTx, id: string) {
  const opp = await repo.findOpportunity(db, id);
  if (!opp) throw new NotFoundError("Oportunidad");
  if (opp.status !== "abierta") throw new ConflictError("La oportunidad ya está cerrada");
  return opp;
}

async function stageId(db: DbOrTx, key: string) {
  const [row] = await db.execute<{ id: string }>(sql`select id from pipeline_stages where key = ${key}`);
  if (!row) throw new Error(`Falta la etapa ${key}: corré pnpm db:seed`);
  return row.id;
}

async function taskTypeId(db: DbOrTx, name: string) {
  const type = (await listTaskTypes(db)).find((t) => t.name === name);
  if (!type) throw new Error(`Falta el tipo de tarea ${name}: corré pnpm db:seed`);
  return type.id;
}

export async function createOpportunity(db: Db, actorId: string, input: OpportunityCreate) {
  const data = opportunityCreate.parse(input);
  const ownerId = data.ownerId ?? actorId;
  if (!(await isActiveUser(db, ownerId))) throw new BadRequestError("El responsable no existe o está inactivo");

  return db.transaction(async (tx) => {
    let clientId = data.clientId;
    let contactId: string | null = null;
    if (data.newClient) {
      const nc = data.newClient;
      const [c] = await tx
        .insert(clients)
        .values({
          name: nc.name,
          phone: nc.phone || null,
          email: nc.email || null,
          status: "potencial",
          priority: "alta",
          ownerId,
        })
        .returning({ id: clients.id });
      if (!c) throw new Error("No se pudo crear el cliente");
      clientId = c.id;
      if (nc.contactName) {
        const [ct] = await tx
          .insert(clientContacts)
          .values({ clientId, name: nc.contactName, phone: nc.phone || null, email: nc.email || null, isDecisionMaker: true })
          .returning({ id: clientContacts.id });
        contactId = ct?.id ?? null;
      }
      await tx.insert(activities).values({ clientId, actorId, kind: "sistema", title: "Cliente creado desde el embudo" });
    } else if (clientId) {
      const [exists] = await tx.execute(sql`select 1 from clients where id = ${clientId}`);
      if (!exists) throw new BadRequestError("El cliente no existe");
    }
    if (!clientId) throw new BadRequestError("Elegí un cliente o cargá uno nuevo");

    const potencial = await stageId(tx, "potencial");
    const [opp] = await tx
      .insert(opportunities)
      .values({ clientId, contactId, title: data.title, amount: data.amount, stageId: potencial, ownerId })
      .returning({ id: opportunities.id });
    if (!opp) throw new Error("No se pudo crear la oportunidad");
    await tx.insert(opportunityStageChanges).values({
      opportunityId: opp.id,
      toStageId: potencial,
      changedById: actorId,
      reason: "se cargó el potencial",
    });

    if (data.firstCallAt) {
      await tx.insert(tasks).values({
        title: "Llamada · primer contacto",
        typeId: await taskTypeId(tx, "Llamada"),
        clientId,
        opportunityId: opp.id,
        assigneeId: ownerId,
        assignedById: ownerId === actorId ? null : actorId,
        createdById: actorId,
        startsAt: new Date(data.firstCallAt),
        durationMinutes: 30,
      });
    }
    return { id: opp.id, clientId };
  });
}

/** Movimiento manual (corrección): a cualquier etapa abierta, nunca a la de cierre ganado. */
export async function moveOpportunity(db: Db, actorId: string, id: string, input: OpportunityMove) {
  const { stageId: to } = opportunityMove.parse(input);
  const opp = await requireOpen(db, id);
  const stage = await repo.findStage(db, to);
  if (!stage) throw new BadRequestError("La etapa no existe");
  if (stage.closes_as) throw new BadRequestError("Para pasar a implementación usá «Venta ganada»");
  if (stage.id === opp.stage_id) return;
  await db.transaction((tx) => moveToStage(tx, { id, stageId: opp.stage_id }, to, actorId, "movida a mano"));
}

export async function winOpportunity(db: Db, actorId: string, id: string, input: OpportunityWin) {
  const data = opportunityWin.parse(input);
  const opp = await requireOpen(db, id);
  if (!(await isActiveUser(db, data.implementerId))) throw new BadRequestError("El implementador no existe o está inactivo");

  return db.transaction(async (tx) => {
    const implementacion = await stageId(tx, "implementacion");
    await tx
      .update(opportunities)
      .set({ status: "ganada", closedAt: new Date(), updatedAt: new Date() })
      .where(eq(opportunities.id, id));
    await moveToStage(tx, { id, stageId: opp.stage_id }, implementacion, actorId, "venta cerrada: se creó el proyecto");

    const [today] = await tx.execute<{ d: string }>(sql`select ${todayAr}::text as d`);
    const [project] = await tx
      .insert(projects)
      .values({
        name: data.projectName,
        clientId: opp.client_id,
        opportunityId: id,
        implementerId: data.implementerId,
        startsOn: data.startsOn,
        dueOn: data.dueOn ?? null,
        estimatedHours: data.estimatedHours ?? null,
        scope: data.scope || null,
        saleAmount: opp.amount,
        paymentTerms: data.paymentTerms,
        sellerId: opp.owner_id,
        soldOn: today?.d ?? data.startsOn,
        createdAutomatically: true,
      })
      .returning({ id: projects.id });
    if (!project) throw new Error("No se pudo crear el proyecto");

    if (opp.client_status === "potencial") {
      await tx.update(clients).set({ status: "activo", statusReason: null, updatedAt: new Date() }).where(eq(clients.id, opp.client_id));
    }
    await tx.insert(activities).values({
      clientId: opp.client_id,
      actorId,
      projectId: project.id,
      kind: "sistema",
      title: `Venta ganada: ${opp.title}`,
      body: `Se creó el proyecto "${data.projectName}" (${data.paymentTerms}).`,
    });

    const [contact] = await tx.execute<{ name: string }>(sql`
      select name from client_contacts where client_id = ${opp.client_id}
      order by (id = ${opp.contact_id}) desc nulls last, is_decision_maker desc, created_at limit 1`);
    await tx.insert(tasks).values({
      title: contact ? `Llamada de kickoff con ${contact.name}` : "Llamada de kickoff",
      typeId: await taskTypeId(tx, "Llamada"),
      clientId: opp.client_id,
      projectId: project.id,
      assigneeId: data.implementerId,
      assignedById: data.implementerId === actorId ? null : actorId,
      createdById: actorId,
      startsAt: new Date(data.kickoffAt),
      durationMinutes: 30,
    });
    const ruleId = await isRuleEnabled(tx, "oportunidad_ganada", "crear_proyecto_y_cuotas");
    if (ruleId) await recordRun(tx, ruleId, [{ entityType: "proyecto", entityId: project.id }]);
    return { projectId: project.id };
  });
}

export async function loseOpportunity(db: Db, actorId: string, id: string, input: OpportunityLose) {
  const { reason } = opportunityLose.parse(input);
  const opp = await requireOpen(db, id);
  await db.transaction(async (tx) => {
    await tx
      .update(opportunities)
      .set({ status: "perdida", lostReason: reason, closedAt: new Date(), updatedAt: new Date() })
      .where(eq(opportunities.id, id));
    await tx.insert(activities).values({
      clientId: opp.client_id,
      actorId,
      kind: "sistema",
      title: `Oportunidad perdida: ${opp.title}`,
      body: reason,
    });
  });
}
