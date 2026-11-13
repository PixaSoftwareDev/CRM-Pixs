/**
 * Planificador dentro de la API: cada 5 minutos revisa qué reglas diarias
 * tocan y archiva tareas viejas. Sin dependencias extra; el reclamo atómico
 * de cada regla (ver service.runDueRules) lo hace seguro con varias instancias.
 */
import type { FastifyBaseLogger } from "fastify";
import { hourAr } from "../../lib/dates";
import { db } from "../../lib/db";
import { archiveDoneTasks } from "./handlers";
import { runDueRules } from "./service";

const EVERY_MS = 5 * 60_000;
/** Las reglas diarias corren desde esta hora (no a la madrugada: crean tareas visibles). */
const FROM_HOUR = 7;

export function startScheduler(log: FastifyBaseLogger): () => void {
  let running = false;
  const tick = async () => {
    if (running) return; // nunca dos vueltas superpuestas en el mismo proceso
    running = true;
    try {
      const archived = await archiveDoneTasks(db);
      if (archived) log.info({ archived }, "Tareas archivadas");
      if (hourAr() >= FROM_HOUR) await runDueRules(db, log);
    } catch (err) {
      log.error({ err }, "Error en el planificador");
    } finally {
      running = false;
    }
  };
  const first = setTimeout(tick, 30_000);
  const timer = setInterval(tick, EVERY_MS);
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
