/**
 * Contratos de Tickets. Flujo: nuevo → en_curso (asignado y agendado) →
 * a_confirmar (trabajo terminado, alguien llama al cliente) → resuelto.
 * Si el cliente dice que no quedó bien, vuelve a en_curso.
 */
import { z } from "zod";

export const TICKET_TYPES = ["falla", "implementacion", "consulta", "mejora"] as const;
export const TICKET_CHANNELS = ["telefono", "whatsapp", "email", "web", "presencial"] as const;
export const TICKET_PRIORITIES = ["normal", "alta", "urgente"] as const;
export const TICKET_STATUSES = ["nuevo", "en_curso", "a_confirmar", "resuelto", "cancelado"] as const;

export type TicketType = (typeof TICKET_TYPES)[number];
export type TicketChannel = (typeof TICKET_CHANNELS)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
export type TicketStatus = (typeof TICKET_STATUSES)[number];

const isoDate = z.iso.date({ message: "Fecha inválida" });
const instant = z.iso.datetime({ offset: true, message: "Fecha y hora inválidas" });
const note = z.string().trim().max(2000);

/** Filtros del buscador (todos opcionales, viajan en la URL). */
export const ticketListQuery = z.object({
  number: z.coerce.number().int().positive().optional(),
  clientId: z.uuid().optional(),
  type: z.enum(TICKET_TYPES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  /** "abiertos" = todo lo que no está resuelto ni cancelado. */
  open: z.enum(["1"]).optional(),
  receivedOn: isoDate.optional(),
  dueOn: isoDate.optional(),
  resolvedOn: isoDate.optional(),
  resolvedById: z.uuid().optional(),
  assigneeId: z.uuid().optional(),
  q: z.string().trim().max(100).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type TicketListQuery = z.input<typeof ticketListQuery>;

export const ticketCreate = z.object({
  clientId: z.uuid({ message: "Elegí el cliente" }),
  projectId: z.uuid().nullable().optional(),
  type: z.enum(TICKET_TYPES),
  channel: z.enum(TICKET_CHANNELS),
  priority: z.enum(TICKET_PRIORITIES).default("normal"),
  title: z.string().trim().min(1, { message: "Poné un título" }).max(200),
  description: z.string().trim().max(8000).optional(),
  /** Quién lo cargó; por defecto, quien está logueado. */
  reportedById: z.uuid().optional(),
  receivedAt: instant.optional(),
  /** Día de compromiso con el cliente. */
  dueOn: isoDate.nullable().optional(),
  /** Si viene, se asigna y agenda al cargarlo. */
  assignTo: z.object({ assigneeId: z.uuid(), scheduledAt: instant }).optional(),
});
export type TicketCreate = z.input<typeof ticketCreate>;

export const ticketUpdate = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(8000).nullable(),
    type: z.enum(TICKET_TYPES),
    priority: z.enum(TICKET_PRIORITIES),
    projectId: z.uuid().nullable(),
    dueOn: isoDate.nullable(),
  })
  .partial();
export type TicketUpdate = z.input<typeof ticketUpdate>;

/** Paso 1: asignar el trabajo (crea la tarea en la agenda del técnico). */
export const ticketAssign = z.object({
  assigneeId: z.uuid({ message: "Elegí quién lo hace" }),
  scheduledAt: instant,
  durationMinutes: z.number().int().min(15).max(8 * 60).default(60),
});
export type TicketAssign = z.input<typeof ticketAssign>;

/** Paso 2: el técnico terminó; se agenda la llamada de confirmación. */
export const ticketWorkDone = z.object({
  confirmerId: z.uuid({ message: "Elegí quién llama al cliente" }),
  confirmAt: instant,
  /** Horas que llevó (se suman al proyecto si el ticket tiene uno). */
  minutes: z.number().int().min(0).max(24 * 60).optional(),
  note: note.optional(),
});
export type TicketWorkDone = z.input<typeof ticketWorkDone>;

/** Paso 3: lo que dijo el cliente en la llamada. */
export const ticketConfirm = z
  .object({
    ok: z.boolean(),
    note: note.optional(),
    /** Si no quedó bien: cuándo vuelve a trabajarlo el técnico. */
    retryAt: instant.optional(),
  })
  .refine((v) => v.ok || !!v.retryAt, { message: "Indicá cuándo lo retoma", path: ["retryAt"] });
export type TicketConfirm = z.input<typeof ticketConfirm>;

export const ticketNote = z.object({ body: z.string().trim().min(1, { message: "Escribí la nota" }).max(2000) });
export type TicketNote = z.input<typeof ticketNote>;

export const ticketCancel = z.object({ reason: z.string().trim().min(1, { message: "Indicá el motivo" }).max(500) });
export type TicketCancel = z.input<typeof ticketCancel>;
