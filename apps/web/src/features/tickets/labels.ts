import type { TicketChannel, TicketPriority, TicketStatus, TicketType } from "@crm/shared";
import type { Tone } from "../../components/ui/Chip";

export const TICKET_STATUS: Record<TicketStatus, { label: string; tone: Tone }> = {
  nuevo: { label: "Nuevo", tone: "indigo" },
  en_curso: { label: "En trabajo", tone: "purple" },
  a_confirmar: { label: "A confirmar", tone: "blue" },
  resuelto: { label: "Resuelto", tone: "green" },
  cancelado: { label: "Cancelado", tone: "slate" },
};

export const TICKET_TYPE: Record<TicketType, { label: string; color: string }> = {
  falla: { label: "Falla", color: "#dc2626" },
  implementacion: { label: "Implementación", color: "#9333ea" },
  consulta: { label: "Consulta", color: "#0891b2" },
  mejora: { label: "Mejora", color: "#16a34a" },
};

export const TICKET_PRIORITY: Record<TicketPriority, { label: string; tone: Tone }> = {
  normal: { label: "Normal", tone: "slate" },
  alta: { label: "Alta", tone: "amber" },
  urgente: { label: "Urgente", tone: "red" },
};

export const TICKET_CHANNEL: Record<TicketChannel, string> = {
  telefono: "Teléfono",
  whatsapp: "WhatsApp",
  email: "Email",
  web: "Web",
  presencial: "Presencial",
};

/** Pasos visibles del flujo (cancelado no es un paso). */
export const STEPS: { status: TicketStatus; label: string }[] = [
  { status: "nuevo", label: "Cargado" },
  { status: "en_curso", label: "Asignado y agendado" },
  { status: "a_confirmar", label: "Trabajo terminado" },
  { status: "resuelto", label: "El cliente confirmó" },
];
