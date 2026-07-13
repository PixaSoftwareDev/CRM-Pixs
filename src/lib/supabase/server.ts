import { eq } from "drizzle-orm"
import { cookies } from "next/headers"
import { db } from "@/db"
import { users } from "@/db/schema"

/**
 * MODO DEMO — shim de "Supabase Auth" con sesión por cookie (sin Supabase real).
 *
 * ⚠️ NO es autenticación de verdad: valida contra la tabla `users` local y una
 * contraseña demo compartida. Sirve solo para recorrer la app en local.
 * Mantiene la misma superficie (`createClient().auth.*`) que usa el resto del
 * código para no tener que tocarlo.
 */
export const SESSION_COOKIE = "demo_session"
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "demo1234"

type DemoUser = { id: string; email: string }

async function findById(id: string): Promise<DemoUser | null> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1)
  const u = rows[0]
  return u ? { id: u.id, email: u.email } : null
}

async function findByEmail(email: string): Promise<DemoUser | null> {
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1)
  const u = rows[0]
  return u ? { id: u.id, email: u.email } : null
}

export async function createClient() {
  const cookieStore = await cookies()

  return {
    auth: {
      async getUser() {
        const id = cookieStore.get(SESSION_COOKIE)?.value
        const user = id ? await findById(id) : null
        return { data: { user }, error: null }
      },
      async signInWithPassword({ email, password }: { email: string; password: string }) {
        const user = await findByEmail(email)
        if (!user || password !== DEMO_PASSWORD) {
          return { data: { user: null }, error: { message: "Credenciales inválidas" } }
        }
        cookieStore.set(SESSION_COOKIE, user.id, {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          maxAge: 60 * 60 * 24 * 7,
        })
        return { data: { user }, error: null }
      },
      async signOut() {
        cookieStore.delete(SESSION_COOKIE)
        return { error: null }
      },
    },
  }
}
