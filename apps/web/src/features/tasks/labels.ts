import type { TaskStatus } from "@pixs/shared";
import type { Tone } from "../../components/ui/Chip";

export const TASK_STATUS: Record<TaskStatus, { label: string; tone: Tone }> = {
  pendiente: { label: "Pendiente", tone: "slate" },
  en_curso: { label: "En curso", tone: "indigo" },
  esperando: { label: "Esperando al cliente", tone: "amber" },
  hecha: { label: "Finalizada", tone: "green" },
  cancelada: { label: "Cancelada", tone: "red" },
};

/** Estados que se eligen a mano (cancelar es otra acción). */
export const EDITABLE_STATUSES = ["pendiente", "en_curso", "esperando", "hecha"] as const satisfies TaskStatus[];

/** Colores para tipos nuevos (los mismos tonos que los del sistema). */
export const TYPE_PALETTE = ["#2563eb", "#0891b2", "#16a34a", "#d97706", "#9333ea", "#dc2626", "#db2777", "#64748b"];

/** Fondo suave del color de un tipo ("#2563eb" → "#2563eb24"). */
export const tint = (hex: string, done = false) => `${hex}${done ? "14" : "24"}`;
