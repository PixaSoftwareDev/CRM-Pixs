/** Rutas HTTP del Embudo. Todas exigen sesión. */
import { idParams, opportunityCreate, opportunityLose, opportunityMove, opportunityWin } from "@pixs/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { db } from "../../lib/db";
import { requireUser, sessionOf } from "../auth/guard";
import * as service from "./service";

export const salesRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("preHandler", requireUser);

  app.get("/api/pipeline", () => service.getPipeline(db));

  app.get("/api/pipeline/stages/:id/opportunities", { schema: { params: idParams } }, (req) =>
    service.listStageOpportunities(db, req.params.id),
  );

  app.post("/api/opportunities", { schema: { body: opportunityCreate } }, async (req, reply) => {
    const opp = await service.createOpportunity(db, sessionOf(req).user.id, req.body);
    return reply.status(201).send(opp);
  });

  app.post("/api/opportunities/:id/move", { schema: { params: idParams, body: opportunityMove } }, async (req, reply) => {
    await service.moveOpportunity(db, sessionOf(req).user.id, req.params.id, req.body);
    return reply.status(204).send();
  });

  app.post("/api/opportunities/:id/win", { schema: { params: idParams, body: opportunityWin } }, (req) =>
    service.winOpportunity(db, sessionOf(req).user.id, req.params.id, req.body),
  );

  app.post("/api/opportunities/:id/lose", { schema: { params: idParams, body: opportunityLose } }, async (req, reply) => {
    await service.loseOpportunity(db, sessionOf(req).user.id, req.params.id, req.body);
    return reply.status(204).send();
  });
};
