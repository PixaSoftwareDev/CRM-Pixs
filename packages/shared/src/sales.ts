/**
 * Contratos del Embudo de ventas. Los movimientos normales de etapa los hacen
 * las tareas (ver tasks service); acá están las acciones explícitas.
 */
import { z } from "zod";
import { isValidPhone, PHONE_ERROR } from "./clients";

export const STAGE_KEYS = [
  "potencial",
  "primer_contacto",
  "reunion",
  "propuesta",
  "seguimiento",
  "cierre",
  "implementacion",
] as const;
export type StageKey = (typeof STAGE_KEYS)[number];

export const OPPORTUNITY_STATUSES = ["abierta", "ganada", "perdida"] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

const name = (max: number, msg: string) => z.string().trim().min(1, { message: msg }).max(max);
/** Importe en centavos (el front convierte desde pesos). */
const cents = z.number().int().min(0).max(1e13);

export const opportunityCreate = z
  .object({
    /** Cliente existente… */
    clientId: z.uuid().optional(),
    /** …o uno nuevo, que se crea como potencial. */
    newClient: z
      .object({
        name: name(160, "Poné el nombre del negocio"),
        contactName: z.string().trim().max(160).optional(),
        phone: z
          .string()
          .trim()
          .max(40)
          .refine((v) => v === "" || isValidPhone(v), PHONE_ERROR)
          .optional(),
        email: z.union([z.email({ message: "Email inválido" }), z.literal("")]).optional(),
      })
      .optional(),
    title: name(200, "Contá qué se le vende"),
    amount: cents.default(0),
    ownerId: z.uuid().optional(),
    /** Primer llamado: se agenda solo como tarea del responsable. */
    firstCallAt: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .refine((v) => !!v.clientId !== !!v.newClient, {
    message: "Elegí un cliente o cargá uno nuevo",
    path: ["clientId"],
  });
export type OpportunityCreate = z.input<typeof opportunityCreate>;

export const opportunityMove = z.object({ stageId: z.uuid() });
export type OpportunityMove = z.input<typeof opportunityMove>;

export const opportunityWin = z
  .object({
    implementerId: z.uuid({ message: "Elegí quién implementa" }),
    projectName: name(160, "Poné el nombre del proyecto"),
    paymentTerms: name(200, "Indicá la forma de pago"),
    scope: z.string().trim().max(4000).optional(),
    startsOn: z.iso.date(),
    dueOn: z.iso.date().nullable().optional(),
    estimatedHours: z.number().int().positive().max(100_000).nullable().optional(),
    /** Llamada de kickoff en la agenda del implementador. */
    kickoffAt: z.iso.datetime({ offset: true }),
  })
  .refine((v) => !v.dueOn || v.dueOn >= v.startsOn, { message: "La entrega no puede ser antes del inicio", path: ["dueOn"] });
export type OpportunityWin = z.input<typeof opportunityWin>;

export const opportunityLose = z.object({ reason: name(500, "Indicá el motivo") });
export type OpportunityLose = z.input<typeof opportunityLose>;
