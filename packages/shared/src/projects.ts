/** Contratos de Proyectos. */
import { z } from "zod";

export const PROJECT_STATUSES = ["nuevo", "en_curso", "en_riesgo", "pausado", "entregado", "cancelado"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_PHASES = ["kickoff", "relevamiento", "desarrollo", "pruebas", "entrega"] as const;
export type ProjectPhase = (typeof PROJECT_PHASES)[number];

/**
 * Salud calculada (lo que se muestra y filtra): mezcla el estado cargado con
 * señales objetivas (tickets vencidos, horas excedidas, entrega pasada).
 */
export const PROJECT_HEALTHS = ["nuevo", "en_curso", "en_riesgo", "pausado", "terminado", "cancelado"] as const;
export type ProjectHealth = (typeof PROJECT_HEALTHS)[number];

const isoDate = z.iso.date({ message: "Fecha inválida" });

const fields = {
  name: z.string().trim().min(1, { message: "Poné un nombre" }).max(160),
  clientId: z.uuid({ message: "Elegí el cliente" }),
  implementerId: z.uuid().nullable(),
  startsOn: isoDate.nullable(),
  dueOn: isoDate.nullable(),
  dueIsEstimate: z.boolean(),
  estimatedHours: z.number().int().positive().max(100_000).nullable(),
  scope: z.string().trim().max(4000).nullable(),
  saleAmount: z.number().int().min(0).max(1e13).nullable(),
  paymentTerms: z.string().trim().max(200).nullable(),
};

const datesOk = (v: { startsOn?: string | null | undefined; dueOn?: string | null | undefined }) =>
  !v.startsOn || !v.dueOn || v.dueOn >= v.startsOn;
const datesMsg = { message: "La entrega no puede ser antes del inicio", path: ["dueOn"] };

export const projectCreate = z
  .object({ ...fields })
  .partial({ implementerId: true, startsOn: true, dueOn: true, dueIsEstimate: true, estimatedHours: true, scope: true, saleAmount: true, paymentTerms: true })
  .refine(datesOk, datesMsg);
export type ProjectCreate = z.input<typeof projectCreate>;

export const projectUpdate = z
  .object({
    ...fields,
    status: z.enum(PROJECT_STATUSES),
    phase: z.enum(PROJECT_PHASES),
  })
  .omit({ clientId: true })
  .partial()
  .refine(datesOk, datesMsg);
export type ProjectUpdate = z.input<typeof projectUpdate>;
