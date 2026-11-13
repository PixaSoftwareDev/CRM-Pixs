/** Rutas de Automatizaciones. Todas exigen sesión. */
import { idParams, ruleCreate, ruleUpdate } from "@pixs/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { db } from "../../lib/db";
import { requireUser, sessionOf } from "../auth/guard";
import { createRule, listRules, runNow, setEnabled } from "./service";

export const automationRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("preHandler", requireUser);

  app.get("/api/automations", () => listRules(db));

  app.post("/api/automations", { schema: { body: ruleCreate } }, async (req, reply) =>
    reply.status(201).send(await createRule(db, sessionOf(req).user.id, req.body)),
  );

  app.patch("/api/automations/:id", { schema: { params: idParams, body: ruleUpdate } }, async (req, reply) => {
    await setEnabled(db, req.params.id, req.body.enabled);
    return reply.status(204).send();
  });

  app.post("/api/automations/:id/run", { schema: { params: idParams } }, (req) => runNow(db, req.params.id));
};
