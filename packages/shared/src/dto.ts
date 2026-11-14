import type { AutomationAction, AutomationTrigger } from "./automations";
import type { CredentialKind } from "./vault";
import type { TicketChannel, TicketPriority, TicketStatus, TicketTaskRole, TicketType } from "./tickets";
import type { ProjectHealth, ProjectPhase, ProjectStatus } from "./projects";
import type { OpportunityStatus, StageKey } from "./sales";
import type { TaskStatus } from "./tasks";

/**
 * Formas de las respuestas de la API (lo que recibe el front).
 * Importes en centavos; fechas `date` como "YYYY-MM-DD"; instantes en ISO 8601.
 */
import type { ClientPriority, ClientStatus } from "./clients";

export interface Page<T> {
  items: T[];
  /** null = no hay más páginas. */
  nextCursor: string | null;
}

export interface ClientListItem {
  id: string;
  name: string;
  status: ClientStatus;
  priority: ClientPriority;
  statusReason: string | null;
  mainContact: string | null;
  email: string | null;
  /** null = quien consulta no tiene acceso a Finanzas. */
  balance: number | null;
  hasOverdueDebt: boolean | null;
  lastContactAt: string | null;
  nextTask: { title: string; startsAt: string | null } | null;
}

export interface ClientSummaryCounts {
  total: number;
  highPriority: number;
  atRisk: number;
}

export interface ContactDto {
  id: string;
  name: string;
  jobTitle: string | null;
  phone: string | null;
  email: string | null;
  isDecisionMaker: boolean;
  handlesPayments: boolean;
  handlesSupport: boolean;
}

export interface BillingProfileDto {
  invoiceLetter: "A" | "B" | "C";
  fiscalAddress: string | null;
  billingEmail: string | null;
  paymentTermDays: number;
  bankAccount: string | null;
}

export interface ClientDetail {
  id: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  taxCondition: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  status: ClientStatus;
  priority: ClientPriority;
  source: string | null;
  statusReason: string | null;
  createdAt: string;
  contacts: ContactDto[];
  billingProfile: BillingProfileDto | null;
  summary: {
    /** Los tres datos de plata son null si quien consulta no tiene acceso a Finanzas. */
    balance: number | null;
    hasOverdueDebt: boolean | null;
    /** Lo vencido (facturas y cuotas sin facturar), descontado el saldo a favor; igual que "Vencido" de Finanzas. */
    overdueAmount: number | null;
    monthlySubscriptions: number | null;
    activeProjects: number;
    openTickets: number;
    lastContactAt: string | null;
  };
}

export interface ActivityDto {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  actorName: string | null;
  occurredAt: string;
}

export interface ClientTaskDto {
  id: string;
  title: string;
  status: TaskStatus;
  typeName: string;
  typeColor: string;
  assigneeName: string;
  startsAt: string | null;
}

export interface StatementRow {
  id: string;
  issuedOn: string;
  kind: "factura" | "nota_debito" | "nota_credito" | "recibo";
  number: string;
  concept: string;
  debit: number;
  credit: number;
  balance: number;
  pendingAmount: number;
  dueOn: string | null;
}

export interface StatementDto {
  from: string | null;
  to: string | null;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  rows: StatementRow[];
}

export interface ClientProjectDto {
  id: string;
  name: string;
  status: string;
  startsOn: string | null;
  dueOn: string | null;
  dueIsEstimate: boolean;
  openTickets: number;
  overdueTickets: number;
  resolvedTickets: number;
  /** Etapas cumplidas (mismo cálculo que en Proyectos). */
  progress: number;
  /** Baja lógica (null = activo): la pestaña Proyectos los oculta, el plan de cuotas no. */
  archivedAt: string | null;
}

// ─── Tareas / agenda ────────────────────────────────────────────────────────

export interface Ref {
  id: string;
  name: string;
}

export interface TeamMember extends Ref {
  color: string | null;
}

export interface TaskTypeDto extends Ref {
  color: string;
  isSystem: boolean;
  /** Tareas vivas de este tipo (para saber si se puede borrar). */
  inUse: number;
}

export interface TaskDto {
  id: string;
  title: string;
  status: TaskStatus;
  startsAt: string | null;
  durationMinutes: number;
  completedAt: string | null;
  type: Ref & { color: string };
  client: Ref | null;
  assignee: Ref;
  /** Quién se la pasó, si la reasignó un compañero. */
  assignedBy: Ref | null;
  /** Quién la cargó (null si la creó una automatización). */
  createdBy: Ref | null;
  /** Papel dentro de su ticket (null si no cuelga de un ticket). */
  ticketRole: TicketTaskRole | null;
}

export interface TaskCommentDto {
  id: string;
  body: string;
  authorName: string | null;
  createdAt: string;
}

export interface TaskDetailDto extends TaskDto {
  comments: TaskCommentDto[];
  /** Contacto principal del cliente, para llamar sin salir del modal. */
  contact: { name: string; phone: string | null; email: string | null } | null;
}

// ─── Embudo ─────────────────────────────────────────────────────────────────

export interface PipelineStageDto {
  id: string;
  key: StageKey;
  name: string;
  description: string | null;
  color: string;
  /** Abiertas en la etapa (en Implementación: ganadas este mes). */
  count: number;
  total: number;
  openTasks: number;
}

export interface StageMoveDto {
  at: string;
  opportunityId: string;
  clientName: string;
  stageName: string;
  reason: string | null;
  actorName: string | null;
}

export interface PipelineDto {
  stages: PipelineStageDto[];
  openCount: number;
  openTotal: number;
  wonThisMonth: number;
  todayMoves: StageMoveDto[];
}

export interface OpportunityCardDto {
  id: string;
  title: string;
  amount: number;
  status: OpportunityStatus;
  client: Ref;
  contact: { name: string; jobTitle: string | null } | null;
  owner: Ref | null;
  stageEnteredAt: string;
  daysInStage: number;
  projectId: string | null;
  nextTask: {
    id: string;
    title: string;
    status: TaskStatus;
    typeName: string;
    typeColor: string;
    assigneeName: string;
    startsAt: string | null;
  } | null;
}

// ─── Proyectos ──────────────────────────────────────────────────────────────

export interface ProjectListItem {
  id: string;
  name: string;
  client: Ref;
  implementer: Ref | null;
  status: ProjectStatus;
  phase: ProjectPhase;
  health: ProjectHealth;
  progress: number;
  createdAutomatically: boolean;
  startsOn: string | null;
  dueOn: string | null;
  dueIsEstimate: boolean;
  pendingTickets: number;
  resolvedTickets: number;
  overdueTickets: number;
  openTasks: number;
  hoursUsed: number;
  estimatedHours: number | null;
  createdAt: string;
  /** Baja lógica (null = activo). */
  archivedAt: string | null;
}

export interface ProjectTicketDto {
  id: string;
  number: number;
  title: string;
  type: string;
  status: string;
  dueAt: string | null;
  overdue: boolean;
  assigneeName: string | null;
}

export interface ProjectDetail extends ProjectListItem {
  scope: string | null;
  sale: {
    amount: number | null;
    paymentTerms: string | null;
    seller: Ref | null;
    soldOn: string | null;
  };
  opportunityId: string | null;
  contact: { name: string; jobTitle: string | null; phone: string | null; email: string | null } | null;
  tickets: ProjectTicketDto[];
  tasks: TaskDto[];
}

// ─── Tickets ────────────────────────────────────────────────────────────────

export interface TicketListItem {
  id: string;
  number: number;
  title: string;
  type: TicketType;
  priority: TicketPriority;
  status: TicketStatus;
  channel: TicketChannel;
  client: Ref;
  receivedAt: string;
  reportedBy: Ref | null;
  dueAt: string | null;
  assignee: Ref | null;
  resolvedAt: string | null;
  overdue: boolean;
  /** Baja lógica del ticket (null = activo). */
  archivedAt: string | null;
  /** El proyecto del ticket está dado de baja (el ticket se oculta igual). */
  projectArchived: boolean;
}

export interface TicketEventDto {
  id: string;
  kind: string;
  message: string;
  actorName: string | null;
  createdAt: string;
}

export interface TicketDetail extends TicketListItem {
  description: string | null;
  project: Ref | null;
  clientPriority: string;
  contact: { name: string; phone: string | null; email: string | null } | null;
  suggestedAssignee: Ref | null;
  scheduledAt: string | null;
  confirmer: Ref | null;
  confirmAt: string | null;
  resolvedBy: Ref | null;
  resolutionNote: string | null;
  tasks: TaskDto[];
  events: TicketEventDto[];
}

// ─── Finanzas ───────────────────────────────────────────────────────────────

export interface FinanceSummary {
  /** Cobrado en el mes en curso (recibos). */
  collectedThisMonth: number;
  /** Pendiente de facturas + cuotas sin facturar. */
  receivable: number;
  receivableCount: number;
  overdue: number;
  /** Ingreso fijo mensual: suma de abonos activos. */
  monthlyRecurring: number;
}

/** Resultado de un cobro (o del "Cobrada" de una cuota). */
export interface PaymentResult {
  /** null si la cuota la cubrió entera el saldo a favor: no hubo recibo nuevo. */
  receiptId: string | null;
  number: number | null;
  /** Del recibo nuevo: lo imputado a facturas y lo que quedó a favor. */
  allocated: number;
  credit: number;
  /** Saldo a favor que ya tenía el cliente y se aplicó a la cuota. */
  fromCredit: number;
}

/** Algo que hay que cobrar: una factura con saldo o una cuota que todavía no se facturó. */
export interface ReceivableDto {
  kind: "invoice" | "installment";
  id: string;
  client: Ref;
  concept: string;
  amount: number;
  dueOn: string | null;
  daysToDue: number | null;
  /** Solo cuotas. */
  autoReminder: boolean | null;
}

export interface SubscriptionDto {
  id: string;
  client: Ref;
  name: string;
  amount: number;
  billingDay: number;
  startsOn: string;
  active: boolean;
  /** Monto anterior al último aumento (para mostrar "antes"). */
  previousAmount: number | null;
  /** Último mes facturado ("YYYY-MM-01"). */
  lastAccrued: string | null;
}

export interface PriceAdjustmentDto {
  id: string;
  effectiveOn: string;
  percent: number;
  count: number;
  appliedBy: string | null;
  note: string | null;
}

export interface AccrualResult {
  created: { client: string; concept: string; amount: number }[];
  /** Abonos que ya tenían la factura de ese mes. */
  skipped: number;
}

export interface CashMovementDto {
  id: string;
  occurredOn: string;
  direction: "ingreso" | "egreso";
  amount: number;
  concept: string;
  category: string | null;
  client: Ref | null;
  paidBy: Ref | null;
  reimbursable: boolean;
  reimbursedAt: string | null;
}

export interface InstallmentDto {
  id: string;
  number: number;
  amount: number;
  dueOn: string;
  status: "pendiente" | "facturada" | "cobrada";
  /** Lo que falta cobrar de la factura (si se facturó). */
  pending: number;
  /**
   * Lo que se cobra al marcarla "Cobrada": lo pendiente menos el saldo a favor
   * del cliente que le corresponde (igual que en Por cobrar).
   */
  toCollect: number;
  autoReminder: boolean;
}

export interface InstallmentPlanDto {
  id: string;
  description: string;
  total: number;
  collected: number;
  installments: InstallmentDto[];
}

// ─── Accesos ────────────────────────────────────────────────────────────────

export interface CredentialDto {
  id: string;
  client: Ref;
  kind: CredentialKind;
  label: string;
  username: string | null;
  connectUrl: string | null;
  notes: string | null;
  /** Última vez que alguien la vio o copió. */
  lastUsedAt: string | null;
  updatedAt: string;
}

export interface AccessLogDto {
  id: string;
  at: string;
  user: Ref;
  action: "ver" | "copiar" | "crear" | "editar" | "eliminar";
  credentialLabel: string;
  client: Ref;
  ipAddress: string | null;
}

// ─── Automatizaciones ───────────────────────────────────────────────────────

export interface AutomationRuleDto {
  id: string;
  name: string;
  trigger: AutomationTrigger;
  action: AutomationAction;
  enabled: boolean;
  /** Si el sistema sabe ejecutarla hoy (las de WhatsApp/mail esperan la integración). */
  available: boolean;
  /** Qué falta para que funcione ("Conectar WhatsApp"). */
  requires: string | null;
  /** Se puede correr a mano (las programadas). */
  runnable: boolean;
  /** Parte de otra función (no se apaga: p. ej. "Venta ganada" siempre crea el proyecto). */
  builtIn: boolean;
  /** Texto para la tarjeta: "Cuando … entonces …". */
  when: string;
  then: string;
  runsThisMonth: number;
  lastRunAt: string | null;
  lastError: string | null;
}

export interface RuleRunResult {
  /** Cuántas cosas hizo (facturas, tareas, proyectos marcados…). */
  affected: number;
  detail: string;
}

/** Un archivo del contenedor. `owner` dice de qué es (en la ficha del cliente se ven también los de sus proyectos y tickets). */
export interface FileDto {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  uploadedBy: Ref | null;
  owner: { kind: "client" | "project" | "ticket"; id: string; name: string };
  /** Lo puede borrar quien lo subió o un administrador. */
  canDelete: boolean;
}
