import { eq } from "drizzle-orm"
import type { NextFunction, Request, Response } from "express"
import jwt from "jsonwebtoken"
import { db } from "@/db"
import { users } from "@/db/schema"
import { config } from "./config"
import { HttpError } from "./http"
import type { AuthUser } from "./types"

export type { AuthUser }

// Extiende el Request de Express con el usuario autenticado.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

/**
 * Valida email + contraseña compartida (mismo modelo que el front: `DEMO_PASSWORD`
 * en texto plano) y devuelve el usuario. `null` si no matchea.
 */
export async function verifyCredentials(email: string, password: string): Promise<AuthUser | null> {
  if (password !== config.demoPassword) return null
  const [u] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)
  return u ?? null
}

/** Firma un JWT con el id/email del usuario (sub = id). */
export function signToken(user: AuthUser): string {
  return jwt.sign({ email: user.email }, config.jwtSecret, {
    subject: user.id,
    expiresIn: config.jwtExpiresIn,
  })
}

/**
 * Middleware: exige `Authorization: Bearer <jwt>` válido y setea `req.user`.
 * 401 si falta o es inválido/expirado.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? ""
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null
  if (!token) throw new HttpError(401, "Falta el token (Authorization: Bearer)")

  try {
    const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload
    if (!payload.sub) throw new Error("sin sub")
    req.user = { id: String(payload.sub), email: String(payload.email ?? "") }
    next()
  } catch {
    throw new HttpError(401, "Token inválido o expirado")
  }
}
