import type { FastifyPluginAsync } from "fastify";
import { requireUser, sessionOf } from "./guard";

export const meRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/me", { onRequest: requireUser }, async (request) => {
    const { user } = sessionOf(request);
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  });
};
