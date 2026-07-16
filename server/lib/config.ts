/**
 * Configuración del backend Express. Lee de process.env directamente (el proceso
 * carga el .env vía `tsx --env-file` o el .env ya presente en el entorno).
 * No reutiliza `src/lib/env.ts` para no arrastrar su validación pensada para Next.
 */

export const config = {
  port: Number(process.env.API_PORT ?? 3002),
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-inseguro-cambiar",
  // 7 días, igual que la cookie del front.
  jwtExpiresIn: "7d" as const,
  demoEmail: process.env.DEMO_EMAIL ?? "admin@pixs.com",
  demoPassword: process.env.DEMO_PASSWORD ?? "demo1234",
  // Orígenes CORS permitidos (coma-separado). "*" permite cualquiera.
  corsOrigins: (process.env.API_CORS_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
}

if (process.env.NODE_ENV === "production" && config.jwtSecret === "dev-secret-inseguro-cambiar") {
  throw new Error("JWT_SECRET es obligatorio en producción")
}
