import type { FastifyPluginAsync } from "fastify";
import { toFetchHeaders } from "../../lib/http";
import { auth } from "./auth";

/**
 * Endpoints de Better Auth que usa el front; el resto (update-user, change-password,
 * change-email, delete-user, list-sessions, revoke-sessions…) no se expone: los
 * usuarios, nombres y contraseñas los maneja un administrador desde /api/users.
 */
const ALLOWED: ReadonlySet<string> = new Set(["GET /api/auth/get-session", "POST /api/auth/sign-in/email", "POST /api/auth/sign-out"]);

function isInactiveSession(body: string): boolean {
  try {
    const data = JSON.parse(body) as { user?: { active?: unknown } } | null;
    return data?.user?.active === false;
  } catch {
    return false;
  }
}

/** Monta los endpoints permitidos de Better Auth (/api/auth/*) sobre Fastify. */
export const authRoutes: FastifyPluginAsync = async (app) => {
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    async handler(request, reply) {
      const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
      const route = `${request.method} ${url.pathname.replace(/\/+$/, "")}`;
      if (!ALLOWED.has(route)) return reply.notFound("Esta dirección no existe");

      const init: RequestInit = { method: request.method, headers: toFetchHeaders(request.headers, request.ip) };
      if (request.body !== undefined) init.body = JSON.stringify(request.body);

      const response = await auth.handler(new Request(url, init));

      reply.status(response.status);
      for (const [key, value] of response.headers) {
        if (key !== "set-cookie") reply.header(key, value);
      }
      // Puede haber varias cookies: se mandan todas, no solo la última.
      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) reply.header("set-cookie", cookies);

      const body = response.body ? await response.text() : null;
      // Un usuario dado de baja no tiene sesión aunque quede alguna en la base (p. ej. si se lo desactivó a mano).
      if (route === "GET /api/auth/get-session" && body && isInactiveSession(body)) return reply.send("null");
      return reply.send(body);
    },
  });
};
