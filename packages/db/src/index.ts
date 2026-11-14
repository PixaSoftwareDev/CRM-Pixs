export { createDb, type Db, type DbOptions, type DbOrTx, type Tx } from "./client";
export * from "./schema/index";
export type * from "./types";

/**
 * Operadores de Drizzle re-exportados: las apps los importan desde acá para usar
 * SIEMPRE la misma copia de drizzle-orm que el schema (dos copias rompen los tipos).
 */
export {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  not,
  notInArray,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
// Migrador (lo usa el arranque en producción; mismo drizzle que el resto).
export { migrate } from "drizzle-orm/postgres-js/migrator";
