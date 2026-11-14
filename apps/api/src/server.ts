import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import Fastify, { type FastifyError } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { ZodError } from "zod";
import { env, isProd } from "./env";
import { AppError, isForeignKeyViolation } from "./lib/errors";
import { meRoutes } from "./modules/auth/me.routes";
import { automationRoutes } from "./modules/automations/routes";
import { clientRoutes } from "./modules/clients/routes";
import { authRoutes } from "./modules/auth/routes";
import { financeRoutes } from "./modules/finance/routes";
import { healthRoutes } from "./modules/health/routes";
import { projectRoutes } from "./modules/projects/routes";
import { salesRoutes } from "./modules/sales/routes";
import { taskRoutes } from "./modules/tasks/routes";
import { ticketRoutes } from "./modules/tickets/routes";
import { userRoutes } from "./modules/users/routes";
import { vaultRoutes } from "./modules/vault/routes";

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      // Nunca loguear cookies ni el header de autorización.
      // Nunca loguear cookies, auth ni claves de Accesos.
      redact: ["req.headers.cookie", "req.headers.authorization", 'res.headers["set-cookie"]', "req.body.secret", "secret"],
      ...(isProd ? {} : { transport: { target: "pino-pretty", options: { singleLine: true } } }),
    },
    // Detrás de nginx: la IP real viene en X-Forwarded-For.
    trustProxy: isProd,
    bodyLimit: 1_048_576,
  });

  app.decorateRequest("session", null);
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Un solo lugar traduce errores a HTTP; nunca se filtran detalles internos al cliente.
  app.setErrorHandler((err: FastifyError, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.status(400).send({
        error: "Datos inválidos",
        issues: err.validation.map((v) => ({ path: v.instancePath, message: v.message })),
      });
    }
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: "Datos inválidos", issues: err.issues });
    }
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({ error: err.message });
    }
    if (isForeignKeyViolation(err)) {
      return reply.status(400).send({ error: "Alguno de los datos elegidos ya no existe. Recargá la página y probá de nuevo." });
    }
    const status = err.statusCode ?? 500;
    if (status >= 500) {
      request.log.error({ err }, "Error no controlado");
      return reply.status(500).send({ error: "Error interno" });
    }
    return reply.status(status).send({ error: err.message });
  });

  await app.register(sensible);
  await app.register(helmet, { contentSecurityPolicy: false });
  // El límite se cuenta por sesión (no por IP): una oficina entera sale por la misma IP.
  // Sin sesión (login, health) se cuenta por IP.
  await app.register(rateLimit, {
    max: 600,
    timeWindow: "1 minute",
    keyGenerator: (req) => /session_token=([^;.]+)/.exec(req.headers.cookie ?? "")?.[1] ?? req.ip,
  });

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(meRoutes);
  await app.register(clientRoutes);
  await app.register(taskRoutes);
  await app.register(salesRoutes);
  await app.register(projectRoutes);
  await app.register(ticketRoutes);
  await app.register(financeRoutes);
  await app.register(vaultRoutes);
  await app.register(automationRoutes);
  await app.register(userRoutes);

  return app;
}
