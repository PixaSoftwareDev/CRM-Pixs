/**
 * Tipos de fila derivados del schema. `X` = lo que devuelve un SELECT,
 * `NewX` = lo que acepta un INSERT. Nunca escribir estos tipos a mano.
 */
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type * as s from "./schema/index";

export type User = InferSelectModel<typeof s.users>;
export type Client = InferSelectModel<typeof s.clients>;
export type NewClient = InferInsertModel<typeof s.clients>;
export type ClientContact = InferSelectModel<typeof s.clientContacts>;
export type NewClientContact = InferInsertModel<typeof s.clientContacts>;
export type PipelineStage = InferSelectModel<typeof s.pipelineStages>;
export type Opportunity = InferSelectModel<typeof s.opportunities>;
export type NewOpportunity = InferInsertModel<typeof s.opportunities>;
export type Project = InferSelectModel<typeof s.projects>;
export type NewProject = InferInsertModel<typeof s.projects>;
export type Ticket = InferSelectModel<typeof s.tickets>;
export type NewTicket = InferInsertModel<typeof s.tickets>;
export type TaskType = InferSelectModel<typeof s.taskTypes>;
export type Task = InferSelectModel<typeof s.tasks>;
export type NewTask = InferInsertModel<typeof s.tasks>;
export type Document = InferSelectModel<typeof s.documents>;
export type NewDocument = InferInsertModel<typeof s.documents>;
export type Installment = InferSelectModel<typeof s.installments>;
export type Subscription = InferSelectModel<typeof s.subscriptions>;
export type CashMovement = InferSelectModel<typeof s.cashMovements>;
export type Credential = InferSelectModel<typeof s.credentials>;
/** Credencial para listados: sin el secreto cifrado. */
export type CredentialSummary = Omit<Credential, "secretCiphertext" | "keyVersion">;
export type Activity = InferSelectModel<typeof s.activities>;
export type Attachment = InferSelectModel<typeof s.attachments>;
export type AutomationRule = InferSelectModel<typeof s.automationRules>;

export type ClientStatus = (typeof s.clientStatus.enumValues)[number];
export type TicketStatus = (typeof s.ticketStatus.enumValues)[number];
export type TaskStatus = (typeof s.taskStatus.enumValues)[number];
export type DocumentKind = (typeof s.documentKind.enumValues)[number];
