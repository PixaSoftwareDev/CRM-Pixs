import type { OpportunityState } from "@/db/schema"

export const STATE_LABELS: Record<OpportunityState, string> = {
  consultado: "Consultado",
  posible: "Posible",
  pendiente: "Pendiente",
  confirmado: "Confirmado",
  en_desarrollo: "En desarrollo",
  finalizado: "Finalizado",
  perdido: "Perdido",
}

export const STATE_TONES: Record<
  OpportunityState,
  "neutral" | "blue" | "green" | "amber" | "red" | "violet"
> = {
  consultado: "neutral",
  posible: "blue",
  pendiente: "amber",
  confirmado: "green",
  en_desarrollo: "violet",
  finalizado: "green",
  perdido: "red",
}
