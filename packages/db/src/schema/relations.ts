/**
 * Relaciones para la API relacional de Drizzle (`db.query.x.findMany({ with })`).
 * No crean nada en la base (las FKs están en cada tabla); solo tipan los joins.
 * Las relaciones hacia `users` se declaran del lado hijo (`one`), sin el inverso,
 * porque nadie consulta "todo lo de un usuario" de una vez.
 */
import { relations } from "drizzle-orm";
import { activities } from "./activity";
import { automationRules, automationRuns } from "./automations";
import { clientBillingProfiles, clientContacts, clients } from "./clients";
import { attachments } from "./files";
import {
  cashMovements,
  documentAllocations,
  documents,
  installmentPlans,
  installments,
  priceAdjustmentItems,
  priceAdjustments,
  subscriptions,
} from "./finance";
import { accounts, sessions, users } from "./identity";
import { projects } from "./projects";
import { opportunities, opportunityStageChanges, pipelineStages } from "./sales";
import { ticketEvents, tickets } from "./support";
import { taskComments, taskTypes, tasks, timeEntries } from "./work";
import { credentialAccessLogs, credentials } from "./vault";

// ─── Identidad ──────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
}));
export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));
export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

// ─── Clientes ───────────────────────────────────────────────────────────────

export const clientsRelations = relations(clients, ({ one, many }) => ({
  owner: one(users, { fields: [clients.ownerId], references: [users.id] }),
  billingProfile: one(clientBillingProfiles),
  contacts: many(clientContacts),
  opportunities: many(opportunities),
  projects: many(projects),
  tickets: many(tickets),
  tasks: many(tasks),
  documents: many(documents),
  installmentPlans: many(installmentPlans),
  subscriptions: many(subscriptions),
  credentials: many(credentials),
  activities: many(activities),
  attachments: many(attachments),
}));
export const clientContactsRelations = relations(clientContacts, ({ one }) => ({
  client: one(clients, { fields: [clientContacts.clientId], references: [clients.id] }),
}));
export const clientBillingProfilesRelations = relations(clientBillingProfiles, ({ one }) => ({
  client: one(clients, { fields: [clientBillingProfiles.clientId], references: [clients.id] }),
}));

// ─── Ventas ─────────────────────────────────────────────────────────────────

export const pipelineStagesRelations = relations(pipelineStages, ({ many }) => ({
  opportunities: many(opportunities),
}));
export const opportunitiesRelations = relations(opportunities, ({ one, many }) => ({
  client: one(clients, { fields: [opportunities.clientId], references: [clients.id] }),
  contact: one(clientContacts, {
    fields: [opportunities.contactId],
    references: [clientContacts.id],
  }),
  stage: one(pipelineStages, { fields: [opportunities.stageId], references: [pipelineStages.id] }),
  owner: one(users, { fields: [opportunities.ownerId], references: [users.id] }),
  stageChanges: many(opportunityStageChanges),
  tasks: many(tasks),
}));
export const opportunityStageChangesRelations = relations(opportunityStageChanges, ({ one }) => ({
  opportunity: one(opportunities, {
    fields: [opportunityStageChanges.opportunityId],
    references: [opportunities.id],
  }),
  fromStage: one(pipelineStages, {
    fields: [opportunityStageChanges.fromStageId],
    references: [pipelineStages.id],
    relationName: "from_stage",
  }),
  toStage: one(pipelineStages, {
    fields: [opportunityStageChanges.toStageId],
    references: [pipelineStages.id],
    relationName: "to_stage",
  }),
  changedBy: one(users, { fields: [opportunityStageChanges.changedById], references: [users.id] }),
}));

// ─── Proyectos ──────────────────────────────────────────────────────────────

export const projectsRelations = relations(projects, ({ one, many }) => ({
  client: one(clients, { fields: [projects.clientId], references: [clients.id] }),
  opportunity: one(opportunities, {
    fields: [projects.opportunityId],
    references: [opportunities.id],
  }),
  implementer: one(users, {
    fields: [projects.implementerId],
    references: [users.id],
    relationName: "project_implementer",
  }),
  seller: one(users, {
    fields: [projects.sellerId],
    references: [users.id],
    relationName: "project_seller",
  }),
  tickets: many(tickets),
  tasks: many(tasks),
  timeEntries: many(timeEntries),
  installmentPlans: many(installmentPlans),
  attachments: many(attachments),
}));

// ─── Soporte ────────────────────────────────────────────────────────────────

export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  client: one(clients, { fields: [tickets.clientId], references: [clients.id] }),
  project: one(projects, { fields: [tickets.projectId], references: [projects.id] }),
  reportedBy: one(users, {
    fields: [tickets.reportedById],
    references: [users.id],
    relationName: "ticket_reporter",
  }),
  assignee: one(users, {
    fields: [tickets.assigneeId],
    references: [users.id],
    relationName: "ticket_assignee",
  }),
  confirmer: one(users, {
    fields: [tickets.confirmerId],
    references: [users.id],
    relationName: "ticket_confirmer",
  }),
  resolvedBy: one(users, {
    fields: [tickets.resolvedById],
    references: [users.id],
    relationName: "ticket_resolver",
  }),
  events: many(ticketEvents),
  tasks: many(tasks),
  attachments: many(attachments),
}));
export const ticketEventsRelations = relations(ticketEvents, ({ one }) => ({
  ticket: one(tickets, { fields: [ticketEvents.ticketId], references: [tickets.id] }),
  actor: one(users, { fields: [ticketEvents.actorId], references: [users.id] }),
}));

// ─── Trabajo ────────────────────────────────────────────────────────────────

export const taskTypesRelations = relations(taskTypes, ({ many }) => ({
  tasks: many(tasks),
}));
export const tasksRelations = relations(tasks, ({ one, many }) => ({
  type: one(taskTypes, { fields: [tasks.typeId], references: [taskTypes.id] }),
  assignee: one(users, {
    fields: [tasks.assigneeId],
    references: [users.id],
    relationName: "task_assignee",
  }),
  assignedBy: one(users, {
    fields: [tasks.assignedById],
    references: [users.id],
    relationName: "task_assigner",
  }),
  client: one(clients, { fields: [tasks.clientId], references: [clients.id] }),
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  opportunity: one(opportunities, {
    fields: [tasks.opportunityId],
    references: [opportunities.id],
  }),
  ticket: one(tickets, { fields: [tasks.ticketId], references: [tickets.id] }),
  comments: many(taskComments),
}));
export const taskCommentsRelations = relations(taskComments, ({ one }) => ({
  task: one(tasks, { fields: [taskComments.taskId], references: [tasks.id] }),
  author: one(users, { fields: [taskComments.authorId], references: [users.id] }),
}));
export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  project: one(projects, { fields: [timeEntries.projectId], references: [projects.id] }),
  user: one(users, { fields: [timeEntries.userId], references: [users.id] }),
}));

// ─── Finanzas ───────────────────────────────────────────────────────────────

export const documentsRelations = relations(documents, ({ one, many }) => ({
  client: one(clients, { fields: [documents.clientId], references: [clients.id] }),
  project: one(projects, { fields: [documents.projectId], references: [projects.id] }),
  /** Si es recibo/NC: a qué facturas se imputó. */
  allocationsOut: many(documentAllocations, { relationName: "allocation_source" }),
  /** Si es factura/ND: qué recibos la cancelan. */
  allocationsIn: many(documentAllocations, { relationName: "allocation_target" }),
}));
export const documentAllocationsRelations = relations(documentAllocations, ({ one }) => ({
  source: one(documents, {
    fields: [documentAllocations.sourceId],
    references: [documents.id],
    relationName: "allocation_source",
  }),
  target: one(documents, {
    fields: [documentAllocations.targetId],
    references: [documents.id],
    relationName: "allocation_target",
  }),
}));
export const installmentPlansRelations = relations(installmentPlans, ({ one, many }) => ({
  client: one(clients, { fields: [installmentPlans.clientId], references: [clients.id] }),
  project: one(projects, { fields: [installmentPlans.projectId], references: [projects.id] }),
  installments: many(installments),
}));
export const installmentsRelations = relations(installments, ({ one }) => ({
  plan: one(installmentPlans, { fields: [installments.planId], references: [installmentPlans.id] }),
  invoice: one(documents, { fields: [installments.invoiceId], references: [documents.id] }),
}));
export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  client: one(clients, { fields: [subscriptions.clientId], references: [clients.id] }),
  priceHistory: many(priceAdjustmentItems),
}));
export const priceAdjustmentsRelations = relations(priceAdjustments, ({ one, many }) => ({
  appliedBy: one(users, { fields: [priceAdjustments.appliedById], references: [users.id] }),
  items: many(priceAdjustmentItems),
}));
export const priceAdjustmentItemsRelations = relations(priceAdjustmentItems, ({ one }) => ({
  adjustment: one(priceAdjustments, {
    fields: [priceAdjustmentItems.adjustmentId],
    references: [priceAdjustments.id],
  }),
  subscription: one(subscriptions, {
    fields: [priceAdjustmentItems.subscriptionId],
    references: [subscriptions.id],
  }),
}));
export const cashMovementsRelations = relations(cashMovements, ({ one }) => ({
  client: one(clients, { fields: [cashMovements.clientId], references: [clients.id] }),
  document: one(documents, { fields: [cashMovements.documentId], references: [documents.id] }),
  paidBy: one(users, { fields: [cashMovements.paidById], references: [users.id] }),
}));

// ─── Accesos ────────────────────────────────────────────────────────────────

export const credentialsRelations = relations(credentials, ({ one, many }) => ({
  client: one(clients, { fields: [credentials.clientId], references: [clients.id] }),
  accessLogs: many(credentialAccessLogs),
}));
export const credentialAccessLogsRelations = relations(credentialAccessLogs, ({ one }) => ({
  credential: one(credentials, {
    fields: [credentialAccessLogs.credentialId],
    references: [credentials.id],
  }),
  user: one(users, { fields: [credentialAccessLogs.userId], references: [users.id] }),
}));

// ─── Actividad, archivos, automatizaciones ──────────────────────────────────

export const activitiesRelations = relations(activities, ({ one }) => ({
  client: one(clients, { fields: [activities.clientId], references: [clients.id] }),
  actor: one(users, { fields: [activities.actorId], references: [users.id] }),
  project: one(projects, { fields: [activities.projectId], references: [projects.id] }),
  ticket: one(tickets, { fields: [activities.ticketId], references: [tickets.id] }),
  document: one(documents, { fields: [activities.documentId], references: [documents.id] }),
}));
export const attachmentsRelations = relations(attachments, ({ one }) => ({
  client: one(clients, { fields: [attachments.clientId], references: [clients.id] }),
  project: one(projects, { fields: [attachments.projectId], references: [projects.id] }),
  ticket: one(tickets, { fields: [attachments.ticketId], references: [tickets.id] }),
  uploadedBy: one(users, { fields: [attachments.uploadedById], references: [users.id] }),
}));
export const automationRulesRelations = relations(automationRules, ({ many }) => ({
  runs: many(automationRuns),
}));
export const automationRunsRelations = relations(automationRuns, ({ one }) => ({
  rule: one(automationRules, { fields: [automationRuns.ruleId], references: [automationRules.id] }),
}));
