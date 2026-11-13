/**
 * Rutas de Accesos. Las respuestas que traen una clave salen con
 * Cache-Control: no-store para que no queden en ningún caché.
 */
import { accessLogQuery, credentialCreate, credentialReveal, credentialUpdate, idParams } from "@pixs/shared";
import type { FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { db } from "../../lib/db";
import { requireUser, sessionOf } from "../auth/guard";
import { type Audit, createCredential, deleteCredential, listAccessLogs, listCredentials, revealCredential, updateCredential } from "./service";

const audit = (req: FastifyRequest): Audit => ({
  userId: sessionOf(req).user.id,
  ip: req.ip ?? null,
  userAgent: req.headers["user-agent"] ?? null,
});

export const vaultRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("preHandler", requireUser);

  app.get("/api/credentials", { schema: { querystring: z.object({ q: z.string().trim().max(100).optional() }) } }, (req) =>
    listCredentials(db, req.query.q),
  );

  app.get("/api/credentials/logs", { schema: { querystring: accessLogQuery } }, (req) => listAccessLogs(db, req.query));

  app.post("/api/credentials", { schema: { body: credentialCreate } }, async (req, reply) =>
    reply.status(201).send(await createCredential(db, audit(req), req.body)),
  );

  app.patch("/api/credentials/:id", { schema: { params: idParams, body: credentialUpdate } }, async (req, reply) => {
    await updateCredential(db, audit(req), req.params.id, req.body);
    return reply.status(204).send();
  });

  app.delete("/api/credentials/:id", { schema: { params: idParams } }, async (req, reply) => {
    await deleteCredential(db, audit(req), req.params.id);
    return reply.status(204).send();
  });

  // Límite propio: ver claves en ráfaga no es un uso normal.
  app.post(
    "/api/credentials/:id/reveal",
    { schema: { params: idParams, body: credentialReveal }, config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const res = await revealCredential(db, audit(req), req.params.id, req.body);
      return reply.header("Cache-Control", "no-store").send(res);
    },
  );
};
