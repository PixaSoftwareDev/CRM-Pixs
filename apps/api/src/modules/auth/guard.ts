import { eq, users } from "@crm/db";
import { type Area, AREA_INFO, effectivePermissions, hasLevel, type Level, LEVEL_LABEL, type Permissions } from "@crm/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import { db } from "../../lib/db";
import { toFetchHeaders } from "../../lib/http";
import { auth, type Session } from "./auth";

/** Qué hace falta para usar una ruta: un nivel en alguno de esos sectores, o solo estar logueado ("any"). */
export type AccessRule = { areas: readonly Area[]; level: Level } | "any";

/** Rol y permisos vigentes del usuario (leídos de la base, no de la cookie). */
export interface Access {
  role: string;
  permissions: Permissions;
}

declare module "fastify" {
  interface FastifyRequest {
    session: Session | null;
    access: Access | null;
  }
  interface FastifyContextConfig {
    /** Regla de acceso propia de la ruta; si falta, vale la del módulo (GET = ver, el resto = editar). */
    access?: AccessRule;
  }
}

/** Para `config.access` de una ruta. */
export const access = (areas: Area | readonly Area[], level: Level): AccessRule => ({
  areas: typeof areas === "string" ? [areas] : areas,
  level,
});

/**
 * Los permisos se leen de la base y se recuerdan 30 segundos por usuario, así
 * no hay una consulta extra en cada request. Al cambiarlos se olvidan al instante.
 */
const ACCESS_TTL_MS = 30_000;
const accessCache = new Map<string, { until: number; value: Access | null }>();

export function forgetAccess(userId: string) {
  accessCache.delete(userId);
}

async function loadAccess(userId: string): Promise<Access | null> {
  const hit = accessCache.get(userId);
  if (hit && hit.until > Date.now()) return hit.value;
  const [row] = await db
    .select({ role: users.role, active: users.active, permissions: users.permissions })
    .from(users)
    .where(eq(users.id, userId));
  const value = row?.active ? { role: row.role, permissions: effectivePermissions(row.role, row.permissions) } : null;
  accessCache.set(userId, { until: Date.now() + ACCESS_TTL_MS, value });
  return value;
}

/**
 * Hook onRequest (antes de validar el body, así sin sesión siempre es 401) para rutas protegidas: valida la sesión
 * contra la base y la deja en `request.session`. Usuarios desactivados se rechazan aunque tengan una sesión vigente.
 */
export async function requireUser(request: FastifyRequest, reply: FastifyReply) {
  const session = await auth.api.getSession({ headers: toFetchHeaders(request.headers, request.ip) });
  if (!session || session.user.active === false) {
    return reply.unauthorized("Sesión inválida o vencida");
  }
  const current = await loadAccess(session.user.id);
  if (!current) return reply.unauthorized("Sesión inválida o vencida");
  request.session = session;
  request.access = current;
}

/**
 * Hook onRequest de un módulo (después de `requireUser`): exige el permiso del
 * sector. Por defecto leer pide "ver" y cualquier cambio pide "editar"; una ruta
 * puede fijar otra regla con `config: { access: access("finanzas", "manage") }`.
 */
export function requireArea(area: Area) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const rule: AccessRule = request.routeOptions.config.access ?? {
      areas: [area],
      level: request.method === "GET" || request.method === "HEAD" ? "read" : "edit",
    };
    if (rule === "any") return;
    const mine = request.access?.permissions;
    if (mine && rule.areas.some((a) => hasLevel(mine[a], rule.level))) return;
    const [first] = rule.areas;
    return reply.forbidden(
      `No tenés permiso para esto (hace falta «${LEVEL_LABEL[rule.level]}» en ${first ? AREA_INFO[first].label : "este sector"}). Pedíselo a un administrador.`,
    );
  };
}

/** Sesión garantizada dentro de un handler que pasó por `requireUser`. */
export function sessionOf(request: FastifyRequest): Session {
  if (!request.session) throw new Error("requireUser no se ejecutó en esta ruta");
  return request.session;
}

/** Hook onRequest para lo que es solo de administradores: el sector Usuarios. Corre después de `requireUser`. */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (request.access?.role !== "admin") {
    return reply.forbidden("Solo un administrador puede hacer esto");
  }
}
