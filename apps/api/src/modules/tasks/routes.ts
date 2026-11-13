/**
 * Rutas HTTP de Tareas, tipos de tarea y equipo. Todas exigen sesión.
 */
import { idParams, taskCommentCreate, taskCreate, taskRangeQuery, taskTypeCreate, taskUpdate } from "@crm/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { db } from "../../lib/db";
import { requireUser, sessionOf } from "../auth/guard";
import * as service from "./service";

export const taskRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("preHandler", requireUser);

  app.get("/api/team", () => service.listTeam(db));

  // ─── Tareas ──────────────────────────────────────────────────────────────
  app.get("/api/tasks", { schema: { querystring: taskRangeQuery } }, (req) =>
    service.listTasksInRange(db, req.query),
  );

  app.post("/api/tasks", { schema: { body: taskCreate } }, async (req, reply) => {
    const task = await service.createTask(db, sessionOf(req).user.id, req.body);
    return reply.status(201).send(task);
  });

  app.get("/api/tasks/:id", { schema: { params: idParams } }, (req) => service.getTask(db, req.params.id));

  app.patch("/api/tasks/:id", { schema: { params: idParams, body: taskUpdate } }, async (req, reply) => {
    await service.updateTask(db, sessionOf(req).user.id, req.params.id, req.body);
    return reply.status(204).send();
  });

  app.post(
    "/api/tasks/:id/comments",
    { schema: { params: idParams, body: taskCommentCreate } },
    async (req, reply) => {
      await service.addComment(db, sessionOf(req).user.id, req.params.id, req.body);
      return reply.status(201).send();
    },
  );

  // ─── Tipos ───────────────────────────────────────────────────────────────
  app.get("/api/task-types", () => service.listTaskTypes(db));

  app.post("/api/task-types", { schema: { body: taskTypeCreate } }, async (req, reply) => {
    const type = await service.createTaskType(db, req.body);
    return reply.status(201).send(type);
  });

  app.delete("/api/task-types/:id", { schema: { params: idParams } }, async (req, reply) => {
    await service.deleteTaskType(db, req.params.id);
    return reply.status(204).send();
  });
};
