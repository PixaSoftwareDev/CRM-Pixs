import { z } from "zod"

/**
 * Validación de variables de entorno (§4/§8 del plan).
 *
 * - `env`         → solo claves NEXT_PUBLIC_*. Seguro de importar en cualquier lado.
 * - `serverEnv()` → incluye secretos. Importar SOLO desde código de servidor
 *                   (db, Server Actions, service.ts). Falla si se usa en el cliente.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
})

const serverSchema = publicSchema.extend({
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ENCRYPTION_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().min(1).optional(),
  ALERT_EMAIL_FROM: z.string().optional(),
  ALERT_EMAIL_TO: z.string().optional(),
  CRON_SECRET: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  GOOGLE_PLACES_API_KEY: z.string().min(1).optional(),
})

// Next inlinea las NEXT_PUBLIC_* en el bundle, así que se referencian explícitas.
// MODO DEMO: defaults placeholder para que la app corra sin .env.local (auth es
// local por cookie, no usa Supabase). En la config real, definilos en .env.local.
export const env = publicSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:1",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "demo-anon-key",
})

let cached: z.infer<typeof serverSchema> | undefined

export function serverEnv() {
  if (typeof window !== "undefined") {
    throw new Error("serverEnv() no debe usarse en el cliente")
  }
  cached ??= serverSchema.parse(process.env)
  return cached
}
