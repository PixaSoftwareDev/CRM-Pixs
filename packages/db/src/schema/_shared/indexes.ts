import { type SQL, sql } from "drizzle-orm";
import { type AnyPgColumn, index } from "drizzle-orm/pg-core";

/**
 * Índice GIN con trigramas para búsquedas `ILIKE '%texto%'` rápidas
 * (buscadores de clientes, tickets, etc.). Requiere la extensión pg_trgm,
 * que se crea en la primera migración.
 */
export const trgmIndex = (name: string, column: AnyPgColumn) =>
  index(name).using("gin", sql`${column} gin_trgm_ops`);

/** Condición para índices parciales sobre filas vivas (no archivadas). */
export const isNull = (column: AnyPgColumn): SQL => sql`${column} IS NULL`;
