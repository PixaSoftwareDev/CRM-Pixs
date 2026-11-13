/** Contratos de Automatizaciones. */
import { z } from "zod";

export const AUTOMATION_TRIGGERS = [
  "cuota_vence",
  "mensaje_entrante",
  "oportunidad_ganada",
  "inicio_de_mes",
  "tarea_reasignada",
  "resumen_diario",
  "proyecto_excede_horas",
  "cliente_sin_contacto",
  "tarea_de_ticket_hecha",
] as const;
export const AUTOMATION_ACTIONS = [
  "enviar_whatsapp",
  "enviar_email",
  "crear_ticket",
  "crear_proyecto_y_cuotas",
  "generar_facturas_abonos",
  "crear_tarea",
  "marcar_en_riesgo",
  "avanzar_ticket",
] as const;
export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number];
export type AutomationAction = (typeof AUTOMATION_ACTIONS)[number];

export const ruleCreate = z.object({ trigger: z.enum(AUTOMATION_TRIGGERS), action: z.enum(AUTOMATION_ACTIONS) });
export type RuleCreate = z.input<typeof ruleCreate>;

export const ruleUpdate = z.object({ enabled: z.boolean() });
