import type { FastifyReply, FastifyRequest } from "fastify";
import { toFetchHeaders } from "../../lib/http";
import { auth, type Session } from "./auth";

declare module "fastify" {
  interface FastifyRequest {
    session: Session | null;
  }
}

/**
 * Hook onRequest (antes de validar el body, así sin sesión siempre es 401) para rutas protegidas: valida la sesión y la deja en `request.session`.
 * Usuarios desactivados se rechazan aunque tengan una sesión vigente.
 */
export async function requireUser(request: FastifyRequest, reply: FastifyReply) {
  const session = await auth.api.getSession({ headers: toFetchHeaders(request.headers) });
  if (!session || session.user.active === false) {
    return reply.unauthorized("Sesión inválida o vencida");
  }
  request.session = session;
}

/** Sesión garantizada dentro de un handler que pasó por `requireUser`. */
export function sessionOf(request: FastifyRequest): Session {
  if (!request.session) throw new Error("requireUser no se ejecutó en esta ruta");
  return request.session;
}

/**
 * Hook onRequest para acciones solo de administradores (aumentos, abonos,
 * devengamiento, automatizaciones, tipos de tarea, borrar claves y ver su
 * registro). Va a nivel de ruta: corre después de `requireUser`.
 */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (request.session?.user.role !== "admin") {
    return reply.forbidden("Solo un administrador puede hacer esto");
  }
}
