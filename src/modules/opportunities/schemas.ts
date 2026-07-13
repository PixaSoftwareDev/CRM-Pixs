import { z } from "zod"
import { OPPORTUNITY_STATES } from "@/db/schema"

export const opportunitySchema = z.object({
  contactId: z.string().uuid("Elegí un contacto"),
  titulo: z.string().min(1, "El título es obligatorio").max(200),
  valorEstimado: z.coerce.number().nonnegative().optional(),
  probabilidad: z.coerce.number().min(0).max(100).optional(),
  moneda: z.string().default("ARS"),
})

export type OpportunityInput = z.infer<typeof opportunitySchema>

export const moveSchema = z.object({
  id: z.string().uuid(),
  estado: z.enum(OPPORTUNITY_STATES),
  motivoPerdida: z.string().max(500).optional(),
})
