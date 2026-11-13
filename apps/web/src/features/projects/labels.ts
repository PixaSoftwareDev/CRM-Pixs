import type { ProjectHealth, ProjectPhase, ProjectStatus } from "@crm/shared";
import type { Tone } from "../../components/ui/Chip";

export const HEALTH: Record<ProjectHealth, { label: string; tone: Tone; bar: string }> = {
  nuevo: { label: "Nuevo", tone: "purple", bar: "#6366f1" },
  en_curso: { label: "En curso", tone: "blue", bar: "#6366f1" },
  en_riesgo: { label: "En riesgo", tone: "red", bar: "#ef4444" },
  pausado: { label: "Pausado", tone: "slate", bar: "#94a3b8" },
  terminado: { label: "Terminado", tone: "green", bar: "#22c55e" },
  cancelado: { label: "Cancelado", tone: "slate", bar: "#94a3b8" },
};

export const PHASE: Record<ProjectPhase, string> = {
  kickoff: "Kickoff",
  relevamiento: "Relevamiento",
  desarrollo: "Desarrollo",
  pruebas: "Pruebas",
  entrega: "Entrega",
};

/** Estados que se eligen a mano ("en riesgo" también lo detecta el sistema). */
export const STATUS_LABEL: Record<ProjectStatus, string> = {
  nuevo: "Nuevo",
  en_curso: "En curso",
  en_riesgo: "En riesgo",
  pausado: "Pausado",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

/** Alertas que se muestran en la tarjeta del proyecto. */
export function alertsOf(p: {
  health: ProjectHealth;
  overdueTickets: number;
  hoursUsed: number;
  estimatedHours: number | null;
  dueOn: string | null;
  phase: ProjectPhase;
}, today: string): string[] {
  if (p.health === "terminado" || p.health === "cancelado") return [];
  const out: string[] = [];
  if (p.overdueTickets) out.push(`${p.overdueTickets} ${p.overdueTickets === 1 ? "ticket vencido" : "tickets vencidos"}`);
  if (p.estimatedHours !== null && p.hoursUsed > p.estimatedHours) out.push(`+${Math.round(p.hoursUsed - p.estimatedHours)} h sobre lo estimado`);
  if (p.dueOn && p.dueOn < today) out.push("Entrega vencida");
  if (p.health === "nuevo") out.push("Falta el kickoff");
  return out;
}
