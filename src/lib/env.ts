import { z } from "zod"

/**
 * Validación de variables de entorno del servidor.
 *
 * `serverEnv()` incluye secretos: importar SOLO desde código de servidor
 * (Server Actions, service.ts, rutas API). Falla si se usa en el cliente.
 * La base es SQLite local (ver `src/db/index.ts`), así que no hay credenciales
 * de base acá; solo las claves de integraciones opcionales.
 */
const serverSchema = z.object({
  ENCRYPTION_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().min(1).optional(),
  ALERT_EMAIL_FROM: z.string().optional(),
  ALERT_EMAIL_TO: z.string().optional(),
  CRON_SECRET: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  GOOGLE_PLACES_API_KEY: z.string().min(1).optional(),
})

let cached: z.infer<typeof serverSchema> | undefined

export function serverEnv() {
  if (typeof window !== "undefined") {
    throw new Error("serverEnv() no debe usarse en el cliente")
  }
  cached ??= serverSchema.parse(process.env)
  return cached
}
