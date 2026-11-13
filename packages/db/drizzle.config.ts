import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// En desarrollo las variables vienen del .env de la raíz; en CI/producción, del entorno.
if (existsSync("../../.env")) process.loadEnvFile("../../.env");

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Falta DATABASE_URL");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  casing: "snake_case",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
