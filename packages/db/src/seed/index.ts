/**
 * Siembra los catálogos que el sistema necesita para funcionar (no datos de ejemplo).
 * Idempotente: se puede correr en cada deploy. Uso: `pnpm db:seed`.
 */
import { createDb, type Db } from "../client";
import { automationRules, pipelineStages, taskTypes } from "../schema/index";

const STAGES = [
  { key: "potencial", name: "Potencial", description: "Se carga el contacto", color: "#94a3b8" },
  { key: "primer_contacto", name: "Primer contacto", description: "Llamada marcada hecha", color: "#0891b2" },
  { key: "reunion", name: "Reunión", description: "Reunión agendada o hecha", color: "#2563eb" },
  { key: "propuesta", name: "Propuesta comercial", description: "Propuesta enviada", color: "#7c3aed" },
  { key: "seguimiento", name: "Seguimiento", description: "Tarea de seguimiento en curso", color: "#d97706" },
  { key: "cierre", name: "Cierre de venta", description: "El cliente dice que sí", color: "#16a34a" },
  { key: "implementacion", name: "Implementación", description: "Pasa solo al cerrar", color: "#9333ea", closesAs: "ganada" },
] as const;

const TASK_TYPES = [
  { name: "Reunión", color: "#2563eb" },
  { name: "Llamada", color: "#0891b2" },
  { name: "Ventas", color: "#16a34a" },
  { name: "Cobranza", color: "#d97706" },
  { name: "Implementación", color: "#9333ea" },
  { name: "Falla", color: "#dc2626" },
] as const;

const RULES = [
  { name: "Recordatorio de cuota", trigger: "cuota_vence", action: "enviar_whatsapp" },
  { name: "Mensaje entrante a ticket", trigger: "mensaje_entrante", action: "crear_ticket" },
  { name: "Venta ganada", trigger: "oportunidad_ganada", action: "crear_proyecto_y_cuotas" },
  { name: "Facturar abonos", trigger: "inicio_de_mes", action: "generar_facturas_abonos" },
  { name: "Aviso de tarea pasada", trigger: "tarea_reasignada", action: "enviar_whatsapp" },
  { name: "Resumen del día", trigger: "resumen_diario", action: "enviar_email" },
  { name: "Proyecto excedido", trigger: "proyecto_excede_horas", action: "marcar_en_riesgo", enabled: false },
  { name: "Tarea de cobranza", trigger: "cuota_vence", action: "crear_tarea" },
  { name: "Cliente sin contacto", trigger: "cliente_sin_contacto", action: "crear_tarea" },
  { name: "Trabajo de ticket terminado", trigger: "tarea_de_ticket_hecha", action: "avanzar_ticket" },
] as const;

/** Siembra los catálogos (idempotente). Lo usan `pnpm db:seed` y el arranque en producción. */
export async function seedCatalogs(db: Db) {
  await db.transaction(async (tx) => {
    await tx
      .insert(pipelineStages)
      .values(STAGES.map((s, position) => ({ ...s, position })))
      .onConflictDoNothing({ target: pipelineStages.key });

    await tx
      .insert(taskTypes)
      .values(TASK_TYPES.map((t, position) => ({ ...t, position, isSystem: true })))
      .onConflictDoNothing({ target: taskTypes.name });

    // Una regla por par disparador → acción: se agregan las que falten (las reglas nuevas
    // de cada versión llegan solas en el próximo deploy, sin tocar las existentes).
    const existing = await tx.select({ trigger: automationRules.trigger, action: automationRules.action }).from(automationRules);
    const missing = RULES.filter((r) => !existing.some((e) => e.trigger === r.trigger && e.action === r.action));
    if (missing.length) await tx.insert(automationRules).values(missing);
  });
}

// Ejecutado directo (`pnpm db:seed`), no al importarlo.
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL");
  const { db, close } = createDb(url, { max: 1 });
  try {
    await seedCatalogs(db);
    console.log("Catálogos sembrados.");
  } finally {
    await close();
  }
}
