import { eq } from "drizzle-orm"
import { cookies } from "next/headers"
import { db } from "@/db"
import { users } from "@/db/schema"
import { DEMO_PASSWORD, SESSION_COOKIE } from "./constants"

/**
 * Sesión local por cookie sobre SQLite.
 *
 * Auth simple para este CRM: valida el email contra la tabla `users` y una
 * contraseña compartida (`DEMO_PASSWORD`, override por env). La sesión es el
 * `id` del usuario guardado en una cookie httpOnly. Sin proveedor externo.
 */
export type SessionUser = { id: string; email: string }

async function findById(id: string): Promise<SessionUser | null> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1)
  const u = rows[0]
  return u ? { id: u.id, email: u.email } : null
}

async function findByEmail(email: string): Promise<SessionUser | null> {
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1)
  const u = rows[0]
  return u ? { id: u.id, email: u.email } : null
}

/** Usuario de la sesión actual, o `null` si no hay cookie válida. */
export async function getUser(): Promise<SessionUser | null> {
  const id = (await cookies()).get(SESSION_COOKIE)?.value
  return id ? findById(id) : null
}

/** Valida credenciales y setea la cookie de sesión. Devuelve el usuario o `null`. */
export async function signIn(email: string, password: string): Promise<SessionUser | null> {
  const user = await findByEmail(email)
  if (!user || password !== DEMO_PASSWORD) return null

  ;(await cookies()).set(SESSION_COOKIE, user.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  })
  return user
}

/** Borra la cookie de sesión. */
export async function signOut(): Promise<void> {
  ;(await cookies()).delete(SESSION_COOKIE)
}
