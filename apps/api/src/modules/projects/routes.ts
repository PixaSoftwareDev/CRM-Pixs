/** Rutas HTTP de Proyectos. Todas exigen sesión. */
import { idParams, projectCreate, projectUpdate } from "@pixs/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { db } from "../../lib/db";
import { requireUser, sessionOf } from "../auth/guard";
import * as service from "./service";

export const projectRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("preHandler", requireUser);

  app.get("/api/projects", () => service.listProjects(db));

  app.get("/api/projects/:id", { schema: { params: idParams } }, (req) => service.getProject(db, req.params.id));

  app.post("/api/projects", { schema: { body: projectCreate } }, async (req, reply) => {
    const project = await service.createProject(db, sessionOf(req).user.id, req.body);
    return reply.status(201).send(project);
  });

  app.patch("/api/projects/:id", { schema: { params: idParams, body: projectUpdate } }, async (req, reply) => {
    await service.updateProject(db, sessionOf(req).user.id, req.params.id, req.body);
    return reply.status(204).send();
  });
};
