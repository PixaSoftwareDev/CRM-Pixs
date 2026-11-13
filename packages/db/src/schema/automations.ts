/**
 * Automatizaciones "Cuando… → entonces…" (pantalla "Automatizaciones").
 * Disparador y acción son enums cerrados: cada par lo implementa un handler
 * en la API (pg-boss); `config` guarda sus parámetros, validados con Zod al leer.
 */
import { boolean, index, integer, jsonb, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { id, ref, timestamps, tstz } from "./_shared/columns";
import { users } from "./identity";

export const automationTrigger = pgEnum("automation_trigger", [
  "cuota_vence",
  "mensaje_entrante",
  "oportunidad_ganada",
  "inicio_de_mes",
  "tarea_reasignada",
  "resumen_diario",
  "proyecto_excede_horas",
  "cliente_sin_contacto",
  "tarea_de_ticket_hecha",
]);
export const automationAction = pgEnum("automation_action", [
  "enviar_whatsapp",
  "enviar_email",
  "crear_ticket",
  "crear_proyecto_y_cuotas",
  "generar_facturas_abonos",
  "crear_tarea",
  "marcar_en_riesgo",
  "avanzar_ticket",
]);
export const automationRunStatus = pgEnum("automation_run_status", ["ok", "error", "omitida"]);

export const automationRules = pgTable("automation_rules", {
  id: id(),
  name: text().notNull(),
  trigger: automationTrigger().notNull(),
  action: automationAction().notNull(),
  config: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  enabled: boolean().notNull().default(true),
  /** Contador denormalizado ("se ejecutó 37 veces"); se incrementa en la misma transacción del run. */
  runCount: integer().notNull().default(0),
  lastRunAt: tstz(),
  createdById: ref().references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
});

export const automationRuns = pgTable(
  "automation_runs",
  {
    id: id(),
    ruleId: ref()
      .notNull()
      .references(() => automationRules.id, { onDelete: "cascade" }),
    status: automationRunStatus().notNull(),
    /** Entidad afectada ("ticket", "project"…) y su id, para trazar qué hizo. */
    entityType: text(),
    entityId: ref(),
    error: text(),
    startedAt: tstz().notNull().defaultNow(),
    finishedAt: tstz(),
  },
  (t) => [index("automation_runs_rule_idx").on(t.ruleId, t.startedAt)],
);
