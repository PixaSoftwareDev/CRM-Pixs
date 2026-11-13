import { sql } from "@crm/db";
import type { FastifyPluginAsync } from "fastify";
import { db } from "../../lib/db";

/** Liveness (proceso vivo) y readiness (puede atender: la base responde). */
export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/health", async () => ({ status: "ok" }));

  app.get("/api/ready", async (_request, reply) => {
    try {
      await db.execute(sql`select 1`);
      return { status: "ok" };
    } catch (err) {
      app.log.error({ err }, "La base no responde");
      return reply.serviceUnavailable("La base no responde");
    }
  });
};
