import type { OpportunityState } from "@/db/schema"

export const STATE_LABELS: Record<OpportunityState, string> = {
  nuevo: "Nuevo",
  en_proceso: "En proceso",
  ganado: "Ganado",
  perdido: "Perdido",
}

export const STATE_TONES: Record<
  OpportunityState,
  "neutral" | "blue" | "green" | "amber" | "red" | "violet"
> = {
  nuevo: "neutral",
  en_proceso: "blue",
  ganado: "green",
  perdido: "red",
}
