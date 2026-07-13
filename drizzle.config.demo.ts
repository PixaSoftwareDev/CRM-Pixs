import { defineConfig } from "drizzle-kit"

// MODO DEMO — config de drizzle-kit para SQLite local (desechable).
// Uso: npx drizzle-kit push --config drizzle.config.demo.ts
export default defineConfig({
  schema: "./src/db/schema/*",
  dialect: "sqlite",
  dbCredentials: { url: process.env.SQLITE_PATH ?? "demo.sqlite" },
  verbose: true,
  strict: false,
})
