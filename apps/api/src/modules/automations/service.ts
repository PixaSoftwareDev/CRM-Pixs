/**
 * Automatizaciones: lista, alta, activar/pausar, ejecutar a mano y el registro
 * de cada ejecución. El "reclamo" de una corrida diaria es un UPDATE atómico:
 * si hay varias instancias de la API, solo una la ejecuta.
 */
import { automationRules, automationRuns, type Db, type DbOrTx, eq, sql } from "@pixs/db";
import { type AutomationRuleDto, type RuleCreate, type RuleRunResult, ruleCreate } from "@pixs/shared";
import { BadRequestError, ConflictError, NotFoundError } from "../../lib/errors";
import { todayAr, toIso, toNumber } from "../../lib/sql";
import { type Recipe, recipeOf } from "./catalog";
import type { Affected } from "./handlers";

export async function listRules(db: Db): Promise<AutomationRuleDto[]> {
  const rows = await db.execute<{
    id: string;
    name: string;
    trigger: AutomationRuleDto["trigger"];
    action: AutomationRuleDto["action"];
    enabled: boolean;
    last_run_at: Date | null;
    runs: string;
    last_error: string | null;
  }>(sql`
    select r.id, r.name, r.trigger, r.action, r.enabled, r.last_run_at,
           (select count(*) from automation_runs x where x.rule_id = r.id and x.status = 'ok'
              and x.started_at >= date_trunc('month', ${todayAr})::timestamp at time zone 'America/Argentina/Buenos_Aires') as runs,
           (select x.error from automation_runs x where x.rule_id = r.id order by x.started_at desc limit 1) as last_error
    from automation_rules r
    order by r.created_at, r.id`);
  return rows.map((r) => {
    const recipe = recipeOf(r.trigger, r.action);
    const available = !!recipe && !recipe.requires;
    return {
      id: r.id,
      name: r.name,
      trigger: r.trigger,
      action: r.action,
      enabled: available && r.enabled,
      available,
      requires: recipe?.requires ?? (recipe ? null : "Todavía no está implementada"),
      runnable: !!recipe?.daily,
      builtIn: !!recipe?.builtIn,
      when: recipe?.when ?? r.trigger,
      then: recipe?.then ?? r.action,
      runsThisMonth: toNumber(r.runs),
      lastRunAt: r.last_run_at ? toIso(r.last_run_at) : null,
      lastError: r.last_error,
    };
  });
}

export async function createRule(db: Db, actorId: string, input: RuleCreate) {
  const { trigger, action } = ruleCreate.parse(input);
  const recipe = recipeOf(trigger, action);
  if (!recipe) throw new BadRequestError("Esa combinación todavía no está disponible");
  const [exists] = await db.execute(sql`select 1 from automation_rules where trigger = ${trigger} and action = ${action}`);
  if (exists) throw new ConflictError("Esa regla ya existe: activala desde la lista");
  const name = `${recipe.when.charAt(0).toUpperCase()}${recipe.when.slice(1)}`;
  const [row] = await db
    .insert(automationRules)
    .values({ name, trigger, action, enabled: !recipe.requires, createdById: actorId })
    .returning({ id: automationRules.id });
  return row;
}

export async function setEnabled(db: Db, id: string, enabled: boolean) {
  const [rule] = await db.select().from(automationRules).where(eq(automationRules.id, id));
  if (!rule) throw new NotFoundError("Regla");
  const recipe = recipeOf(rule.trigger, rule.action);
  if (recipe?.builtIn) throw new BadRequestError("Esta regla es parte de otra función y no se puede pausar");
  if (enabled && (!recipe || recipe.requires)) {
    throw new BadRequestError(recipe?.requires ? `Para activarla: ${recipe.requires}` : "Todavía no está implementada");
  }
  await db.update(automationRules).set({ enabled, updatedAt: new Date() }).where(eq(automationRules.id, id));
}

/** Deja registro de lo que hizo una regla (una fila por cosa afectada). */
export async function recordRun(db: DbOrTx, ruleId: string, affected: Affected[], error?: string) {
  if (error) {
    await db.insert(automationRuns).values({ ruleId, status: "error", error: error.slice(0, 500), finishedAt: new Date() });
  } else if (affected.length) {
    await db.insert(automationRuns).values(
      affected.map((a) => ({ ruleId, status: "ok" as const, entityType: a.entityType, entityId: isUuid(a.entityId) ? a.entityId : null, finishedAt: new Date() })),
    );
  }
  await db
    .update(automationRules)
    .set({ runCount: sql`${automationRules.runCount} + ${affected.length}`, lastRunAt: new Date() })
    .where(eq(automationRules.id, ruleId));
}

const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

const DETAIL: Record<string, (n: number) => string> = {
  factura: (n) => (n === 0 ? "Todos los abonos del mes ya estaban facturados." : n === 1 ? "Se generó 1 factura de abono." : `Se generaron ${n} facturas de abonos.`),
  tarea: (n) => (n === 0 ? "No hacía falta crear ninguna tarea." : n === 1 ? "Se creó 1 tarea." : `Se crearon ${n} tareas.`),
  proyecto: (n) => (n === 0 ? "Ningún proyecto se pasó de horas." : n === 1 ? "1 proyecto pasó a En riesgo." : `${n} proyectos pasaron a En riesgo.`),
};

async function execute(db: Db, ruleId: string, recipe: Recipe): Promise<RuleRunResult> {
  if (!recipe.daily) throw new BadRequestError("Esta regla se dispara sola con un evento: no se corre a mano");
  try {
    const affected = await recipe.daily(db);
    await recordRun(db, ruleId, affected);
    return { affected: affected.length, detail: DETAIL[recipe.unit ?? "tarea"]?.(affected.length) ?? `Listo: ${affected.length}.` };
  } catch (err) {
    await recordRun(db, ruleId, [], err instanceof Error ? err.message : String(err));
    throw err;
  }
}

/** "Ejecutar ahora" desde la pantalla. */
export async function runNow(db: Db, id: string): Promise<RuleRunResult> {
  const [rule] = await db.select().from(automationRules).where(eq(automationRules.id, id));
  if (!rule) throw new NotFoundError("Regla");
  const recipe = recipeOf(rule.trigger, rule.action);
  if (!recipe || recipe.requires) throw new BadRequestError(recipe?.requires ? `Para usarla: ${recipe.requires}` : "Todavía no está implementada");
  return execute(db, rule.id, recipe);
}

/**
 * Corrida diaria: cada regla activa y programada se ejecuta una vez por día
 * (desde las 7 de Argentina). El UPDATE … RETURNING reclama el turno: si dos
 * procesos llegan juntos, solo uno lo obtiene.
 */
export async function runDueRules(db: Db, log: { info: (o: object, m: string) => void; error: (o: object, m: string) => void }) {
  const rules = await db.select().from(automationRules).where(eq(automationRules.enabled, true));
  for (const rule of rules) {
    const recipe = recipeOf(rule.trigger, rule.action);
    if (!recipe?.daily || recipe.requires) continue;
    const claimed = await db.execute(sql`
      update automation_rules set last_run_at = now()
      where id = ${rule.id} and enabled
        and (last_run_at is null or (last_run_at at time zone 'America/Argentina/Buenos_Aires')::date < ${todayAr})
      returning id`);
    if (!claimed.length) continue;
    try {
      const res = await execute(db, rule.id, recipe);
      log.info({ rule: rule.name, affected: res.affected }, "Automatización ejecutada");
    } catch (err) {
      log.error({ err, rule: rule.name }, "Automatización con error");
    }
  }
}

/** Para las reglas por evento: ¿está activa? */
export async function isRuleEnabled(db: DbOrTx, trigger: string, action: string) {
  const [row] = await db.execute<{ id: string }>(sql`
    select id from automation_rules where trigger = ${trigger} and action = ${action} and enabled limit 1`);
  return row?.id ?? null;
}
