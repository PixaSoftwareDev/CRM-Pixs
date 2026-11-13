/**
 * Catálogo de recetas "cuando … → entonces …": qué sabe hacer el sistema hoy.
 * Las que necesitan WhatsApp o un mail saliente se muestran, pero no se pueden
 * activar hasta conectar esa integración (no prometemos lo que no corre).
 */
import type { Db } from "@pixs/db";
import type { AutomationAction, AutomationTrigger } from "@pixs/shared";
import * as h from "./handlers";

export interface Recipe {
  when: string;
  then: string;
  /** Programada: corre una vez por día (y se puede correr a mano). */
  daily?: (db: Db) => Promise<h.Affected[]>;
  /** Qué produce, para el mensaje del resultado. */
  unit?: "factura" | "tarea" | "proyecto";
  /** Disparada por un evento (se ejecuta dentro de otra acción). */
  event?: true;
  /** Siempre activa: es parte de otra función. */
  builtIn?: true;
  /** Qué falta conectar para que funcione. */
  requires?: string;
}

const WHATSAPP = "Conectar WhatsApp";
const EMAIL = "Conectar un mail saliente";

export const RECIPES: Partial<Record<`${AutomationTrigger}:${AutomationAction}`, Recipe>> = {
  "inicio_de_mes:generar_facturas_abonos": { when: "empieza el mes", then: "generar las facturas de los abonos", daily: h.accrueSubscriptions, unit: "factura" },
  "cuota_vence:crear_tarea": { when: "una cuota o factura vence en 3 días o ya venció", then: "crear la tarea de cobranza para el responsable", daily: h.collectionTasks, unit: "tarea" },
  "cliente_sin_contacto:crear_tarea": { when: "un cliente activo pasa 30 días sin contacto", then: "crear una tarea de llamada para el responsable", daily: h.noContactTasks, unit: "tarea" },
  "proyecto_excede_horas:marcar_en_riesgo": { when: "un proyecto se pasa de las horas estimadas", then: "marcarlo en riesgo y avisarle al implementador", daily: h.overBudgetProjects, unit: "proyecto" },
  "tarea_de_ticket_hecha:avanzar_ticket": { when: "el técnico finaliza la tarea de un ticket en Mi día", then: "pasar el ticket a confirmar y agendar la llamada al cliente", event: true },
  "oportunidad_ganada:crear_proyecto_y_cuotas": { when: "una venta se marca como ganada", then: "crear el proyecto y agendar el kickoff", event: true, builtIn: true },
  "cuota_vence:enviar_whatsapp": { when: "una cuota vence", then: "mandar recordatorio por WhatsApp al cliente", requires: WHATSAPP },
  "mensaje_entrante:crear_ticket": { when: "entra un WhatsApp o mail de un cliente", then: "crear un ticket, clasificarlo y asignarlo", requires: WHATSAPP },
  "tarea_reasignada:enviar_whatsapp": { when: "se pasa una tarea a un compañero", then: "avisarle por WhatsApp con el comentario", requires: WHATSAPP },
  "resumen_diario:enviar_email": { when: "son las 7:30", then: "mandar el resumen del día por mail", requires: EMAIL },
};

export const recipeOf = (trigger: string, action: string) => RECIPES[`${trigger}:${action}` as keyof typeof RECIPES];
