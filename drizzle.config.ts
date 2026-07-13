import { defineConfig } from "drizzle-kit"

// Base del proyecto: SQLite local (better-sqlite3). El schema es la fuente de
// verdad; se sincroniza con `npm run db:push`. Override del archivo con SQLITE_PATH.
export default defineConfig({
  schema: "./src/db/schema/*",
  dialect: "sqlite",
  dbCredentials: { url: process.env.SQLITE_PATH ?? "demo.sqlite" },
  verbose: true,
  strict: false,
})
