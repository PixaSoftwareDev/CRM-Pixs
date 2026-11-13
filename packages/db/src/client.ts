import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

export interface DbOptions {
  /** Conexiones del pool por proceso. Con varias réplicas: réplicas × max < max_connections de Postgres. */
  max?: number;
}

/**
 * Crea el pool y el cliente Drizzle. Una sola instancia por proceso:
 * se crea al arrancar la API y se cierra en el shutdown (`close()`).
 */
export function createDb(url: string, { max = 10 }: DbOptions = {}) {
  const sql = postgres(url, {
    max,
    idle_timeout: 20,
    connect_timeout: 10,
    // Los `date` llegan como string "YYYY-MM-DD": sin corrimientos por zona horaria.
    types: { date: { to: 1082, from: [1082], serialize: (v: string) => v, parse: (v: string) => v } },
  });
  const db = drizzle(sql, { schema, casing: "snake_case" });
  return { db, close: () => sql.end({ timeout: 5 }) };
}

export type Db = ReturnType<typeof createDb>["db"];
/** Cliente dentro de una transacción; los servicios aceptan `Db | Tx` para componer operaciones. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;
