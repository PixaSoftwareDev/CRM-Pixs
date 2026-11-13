import { z } from "zod";

/**
 * Variables de entorno validadas al arrancar: si falta o está mal una, la API
 * no levanta (falla rápido en vez de romperse a mitad de un request).
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default("127.0.0.1"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  DATABASE_URL: z.url(),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  /** Secreto para firmar sesiones. Generar con: openssl rand -base64 32 */
  BETTER_AUTH_SECRET: z.string().min(32),
  /** URL pública por la que el navegador llega a la API (en dev, el proxy de Vite). */
  BETTER_AUTH_URL: z.url(),
  /** Origen del front, para CSRF/orígenes confiables. */
  WEB_ORIGIN: z.url(),
  /**
   * Clave maestra de Accesos (AES-256-GCM): 32 bytes en base64. Generar con:
   * openssl rand -base64 32. Perderla = perder las claves guardadas: guardarla aparte.
   */
  VAULT_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, { message: "Tiene que ser de 32 bytes en base64" }),
  /** Versión de VAULT_KEY (para rotarla sin descifrar todo de golpe). */
  VAULT_KEY_VERSION: z.coerce.number().int().min(1).max(32767).default(1),
  /** Corre las automatizaciones programadas en este proceso (apagarlo en réplicas extra). */
  SCHEDULER_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Variables de entorno inválidas:\n" + z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
