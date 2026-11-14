/**
 * Contratos del módulo Clientes: lo que valida la API en cada borde y lo que
 * usa el front para sus formularios. Una sola definición para los dos lados.
 */
import { z } from "zod";
import { isValidCuit, normalizeCuit } from "./cuit";

export const CLIENT_STATUSES = ["potencial", "activo", "en_riesgo", "baja"] as const;
export const CLIENT_PRIORITIES = ["alta", "media", "baja"] as const;
export const CLIENT_SOURCES = ["referido", "web", "captacion", "otro"] as const;
export const TAX_CONDITIONS = [
  "responsable_inscripto",
  "monotributo",
  "exento",
  "consumidor_final",
] as const;
export const INVOICE_LETTERS = ["A", "B", "C"] as const;
/** Tipos que se cargan a mano en la línea de tiempo (el resto los escribe el sistema). */
export const MANUAL_ACTIVITY_KINDS = ["nota", "llamada", "reunion", "whatsapp", "email"] as const;
/** Estados que exigen motivo. */
export const STATUSES_WITH_REASON = ["en_riesgo", "baja"] as const;

export type ClientStatus = (typeof CLIENT_STATUSES)[number];
export type ClientPriority = (typeof CLIENT_PRIORITIES)[number];

const text = (max: number) => z.string().trim().min(1).max(max);
/** String opcional: vacío ("") se guarda como null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

const cuit = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : normalizeCuit(v)))
  .refine((v) => v === null || isValidCuit(v), "CUIT inválido")
  .nullable()
  .optional();

const email = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v.toLowerCase()))
  .refine((v) => v === null || z.email().safeParse(v).success, "Email inválido")
  .nullable()
  .optional();

const uuid = z.uuid();

// ─── Clientes ───────────────────────────────────────────────────────────────

export const clientListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  /** Sin estado = todos menos los de baja (esos se ven solo con status=baja). */
  status: z.enum(CLIENT_STATUSES).optional(),
  priority: z.enum(CLIENT_PRIORITIES).optional(),
  /** Cursor opaco devuelto por la página anterior. */
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ClientListQuery = z.infer<typeof clientListQuery>;

const clientFields = {
  name: text(160),
  legalName: optionalText(200),
  taxId: cuit,
  taxCondition: z.enum(TAX_CONDITIONS).nullable().optional(),
  address: optionalText(300),
  phone: optionalText(40),
  email,
  priority: z.enum(CLIENT_PRIORITIES),
  source: z.enum(CLIENT_SOURCES).nullable().optional(),
  ownerId: uuid.nullable().optional(),
};

export const clientCreate = z.object({
  ...clientFields,
  // Los clientes nuevos arrancan con prioridad alta (definición del diseño).
  priority: clientFields.priority.default("alta"),
  status: z.enum(["potencial", "activo"]).default("potencial"),
});
export type ClientCreate = z.input<typeof clientCreate>;

export const clientUpdate = z.object(clientFields).partial();
export type ClientUpdate = z.input<typeof clientUpdate>;

export const clientStatusChange = z
  .object({
    status: z.enum(CLIENT_STATUSES),
    reason: optionalText(500),
  })
  .refine(
    (v) => !(STATUSES_WITH_REASON as readonly string[]).includes(v.status) || !!v.reason,
    { message: "Indicá el motivo", path: ["reason"] },
  );
export type ClientStatusChange = z.input<typeof clientStatusChange>;

// ─── Personas del negocio ───────────────────────────────────────────────────

export const contactInput = z.object({
  name: text(160),
  jobTitle: optionalText(120),
  phone: optionalText(40),
  email,
  isDecisionMaker: z.boolean().default(false),
  handlesPayments: z.boolean().default(false),
  handlesSupport: z.boolean().default(false),
});
export type ContactInput = z.input<typeof contactInput>;

export const contactUpdate = contactInput.partial();
export type ContactUpdate = z.input<typeof contactUpdate>;

// ─── Facturación ────────────────────────────────────────────────────────────

export const billingProfileInput = z.object({
  invoiceLetter: z.enum(INVOICE_LETTERS),
  fiscalAddress: optionalText(300),
  billingEmail: email,
  paymentTermDays: z.coerce.number().int().min(0).max(180),
  bankAccount: optionalText(60),
});
export type BillingProfileInput = z.input<typeof billingProfileInput>;

// ─── Actividad ──────────────────────────────────────────────────────────────

export const activityCreate = z.object({
  kind: z.enum(MANUAL_ACTIVITY_KINDS),
  body: text(2000),
});
export type ActivityCreate = z.input<typeof activityCreate>;

export const cursorQuery = z.object({
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const dateRangeQuery = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: "La fecha desde no puede ser posterior a hasta",
    path: ["from"],
  });

export const idParams = z.object({ id: uuid });
