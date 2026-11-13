import { env } from "./env";
import { closeDb } from "./lib/db";
import { startScheduler } from "./modules/automations/scheduler";
import { buildServer } from "./server";

const app = await buildServer();
let stopScheduler = () => {};

// Apagado ordenado: deja de aceptar requests, termina los que están en curso y cierra la base.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    app.log.info({ signal }, "Apagando");
    stopScheduler();
    await app.close();
    await closeDb();
    process.exit(0);
  });
}

try {
  await app.listen({ port: env.PORT, host: env.HOST });
  if (env.SCHEDULER_ENABLED) stopScheduler = startScheduler(app.log);
} catch (err) {
  app.log.fatal({ err }, "No se pudo iniciar la API");
  await closeDb();
  process.exit(1);
}
