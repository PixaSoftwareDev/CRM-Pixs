import { defineConfig } from "drizzle-kit"

// Conexión directa para migraciones (no el pooler). `generate` no la usa;
// `migrate`/`push` fallan con mensaje claro si falta.
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? ""

// Migraciones controladas manualmente (§1/§8 del plan): revisá el SQL generado
// antes de aplicar, y usá CREATE INDEX CONCURRENTLY para no lockear tablas.
export default defineConfig({
  schema: "./src/db/schema/*",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url },
  verbose: true,
  strict: true,
})
