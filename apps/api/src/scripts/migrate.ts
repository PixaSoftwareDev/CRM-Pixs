/**
 * Arranque en producción: aplica las migraciones pendientes y siembra los
 * catálogos (las dos cosas son idempotentes). Corre antes de levantar la API.
 */
import { createDb, migrate } from "@crm/db";
import { seedCatalogs } from "@crm/db/seed";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Falta DATABASE_URL");
const folder = process.env.MIGRATIONS_DIR ?? new URL("../../../../packages/db/migrations", import.meta.url).pathname;

const { db, close } = createDb(url, { max: 1 });
try {
  await migrate(db, { migrationsFolder: folder });
  await seedCatalogs(db);
  console.log("Base al día: migraciones aplicadas y catálogos sembrados.");
} finally {
  await close();
}
