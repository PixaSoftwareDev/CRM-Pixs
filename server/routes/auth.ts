import { eq } from "drizzle-orm"
import { Router } from "express"
import { z } from "zod"
import { db } from "@/db"
import { users } from "@/db/schema"
import { requireAuth, signToken, verifyCredentials } from "../lib/auth"
import { config } from "../lib/config"
import { asyncHandler, HttpError, parse } from "../lib/http"

export const authRouter = Router()

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

/** POST /api/auth/login → { token, user } */
authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = parse(loginSchema, req.body)
    const user = await verifyCredentials(email, password)
    if (!user) throw new HttpError(401, "Email o contraseña inválidos")
    res.json({ token: signToken(user), user })
  }),
)

/** POST /api/auth/demo-login → login rápido con las credenciales demo del env. */
authRouter.post(
  "/demo-login",
  asyncHandler(async (_req, res) => {
    const user = await verifyCredentials(config.demoEmail, config.demoPassword)
    if (!user) throw new HttpError(401, "Usuario demo no existe")
    res.json({ token: signToken(user), user })
  }),
)

/** GET /api/auth/me → datos del usuario del token. */
authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const [u] = await db.select().from(users).where(eq(users.id, req.user.id)).limit(1)
    if (!u) throw new HttpError(404, "Usuario no encontrado")
    res.json({ id: u.id, email: u.email, nombre: u.nombre, rol: u.rol })
  }),
)
