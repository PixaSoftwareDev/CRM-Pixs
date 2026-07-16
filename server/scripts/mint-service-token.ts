/**
 * Genera un TOKEN DE SERVICIO (JWT Bearer) de larga duración para integraciones
 * externas (bots, sistemas de terceros). Se firma con el mismo `JWT_SECRET` que
 * usa el backend REST, así que el token vale mientras el API corra con ese
 * secreto. Reusa el usuario admin (o el email que le pases).
 *
 * Correlo en el VPS, desde la raíz del repo, con el .env del backend cargado:
 *
 *   npm run api:token                 # admin@pixs.com, 365 días
 *   npm run api:token -- otro@x.com   # otro usuario, 365 días
 *   npm run api:token -- admin@pixs.com 730   # 2 años
 *
 * Imprime SOLO el token por stdout (el resto va por stderr), para poder capturarlo:
 *   TOKEN=$(npm run --silent api:token)
 */
import { eq } from "drizzle-orm"
import jwt from "jsonwebtoken"
import { db } from "@/db"
import { users } from "@/db/schema"

async function main() {
  const email = process.argv[2]?.trim() || process.env.DEMO_EMAIL || "admin@pixs.com"
  const days = Number(process.argv[3] ?? 365)
  const secret = process.env.JWT_SECRET

  if (!secret) {
    throw new Error(
      "Falta JWT_SECRET en el entorno. Corré con --env-file=.env (o `npm run api:token`).",
    )
  }
  if (!Number.isFinite(days) || days <= 0) {
    throw new Error(`Días inválidos: "${process.argv[3]}". Pasá un número > 0.`)
  }

  const [u] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  if (!u) {
    throw new Error(
      `No existe el usuario "${email}" en la base. Verificá DEMO_EMAIL / SQLITE_PATH.`,
    )
  }

  // Mismo formato que server/lib/auth.ts#signToken, pero con vencimiento configurable.
  const token = jwt.sign({ email: u.email }, secret, {
    subject: u.id,
    expiresIn: `${days}d`,
  })

  console.error(`\n✅ Token de servicio para ${u.email} — válido ${days} días.`)
  console.error("   Usalo así:  Authorization: Bearer <token>\n")
  console.log(token)
}

main().catch((err: unknown) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
