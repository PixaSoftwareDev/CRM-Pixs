import type { FastifyPluginAsync } from "fastify";
import { toFetchHeaders } from "../../lib/http";
import { auth } from "./auth";

/** Monta los endpoints de Better Auth (/api/auth/*) sobre Fastify. */
export const authRoutes: FastifyPluginAsync = async (app) => {
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    async handler(request, reply) {
      const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
      const init: RequestInit = { method: request.method, headers: toFetchHeaders(request.headers) };
      if (request.body !== undefined) init.body = JSON.stringify(request.body);

      const response = await auth.handler(new Request(url, init));

      reply.status(response.status);
      for (const [key, value] of response.headers) {
        if (key !== "set-cookie") reply.header(key, value);
      }
      // Puede haber varias cookies: se mandan todas, no solo la última.
      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) reply.header("set-cookie", cookies);

      return reply.send(response.body ? await response.text() : null);
    },
  });
};
