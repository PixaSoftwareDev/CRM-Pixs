/** Rutas de usuarios internos. Solo administradores. */
import { idParams, userCreate, userUpdate } from "@crm/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { db } from "../../lib/db";
import { requireAdmin, requireUser, sessionOf } from "../auth/guard";
import { createUser, listUsers, updateUser } from "./service";

export const userRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("onRequest", requireUser);
  app.addHook("onRequest", requireAdmin);

  app.get("/api/users", () => listUsers(db));

  app.post("/api/users", { schema: { body: userCreate } }, async (req, reply) =>
    reply.status(201).send(await createUser(db, req.body)),
  );

  app.patch("/api/users/:id", { schema: { params: idParams, body: userUpdate } }, async (req, reply) => {
    await updateUser(db, sessionOf(req).user.id, req.params.id, req.body);
    return reply.status(204).send();
  });
};
