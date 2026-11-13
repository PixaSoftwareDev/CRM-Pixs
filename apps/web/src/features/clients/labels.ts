import type { ClientPriority, ClientStatus } from "@pixs/shared";
import type { Tone } from "../../components/ui/Chip";

export const STATUS: Record<ClientStatus, { label: string; tone: Tone }> = {
  potencial: { label: "Potencial", tone: "slate" },
  activo: { label: "Activo", tone: "green" },
  en_riesgo: { label: "En riesgo", tone: "amber" },
  baja: { label: "Baja", tone: "red" },
};

export const PRIORITY: Record<ClientPriority, { label: string; tone: Tone }> = {
  alta: { label: "Alta", tone: "red" },
  media: { label: "Media", tone: "amber" },
  baja: { label: "Baja", tone: "slate" },
};

export const TAX_CONDITION: Record<string, string> = {
  responsable_inscripto: "Responsable inscripto",
  monotributo: "Monotributo",
  exento: "Exento",
  consumidor_final: "Consumidor final",
};

export const SOURCE: Record<string, string> = {
  referido: "Referido",
  web: "Web",
  captacion: "Captación",
  otro: "Otro",
};

export const DOC_KIND: Record<string, { label: string; tone: Tone }> = {
  factura: { label: "Factura", tone: "blue" },
  nota_debito: { label: "Nota de débito", tone: "blue" },
  nota_credito: { label: "Nota de crédito", tone: "purple" },
  recibo: { label: "Recibo", tone: "green" },
};

export const PROJECT_STATUS: Record<string, { label: string; tone: Tone }> = {
  nuevo: { label: "Nuevo", tone: "slate" },
  en_curso: { label: "En curso", tone: "blue" },
  en_riesgo: { label: "En riesgo", tone: "amber" },
  pausado: { label: "Pausado", tone: "slate" },
  entregado: { label: "Entregado", tone: "green" },
  cancelado: { label: "Cancelado", tone: "red" },
};
