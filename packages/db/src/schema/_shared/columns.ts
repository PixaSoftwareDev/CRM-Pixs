import { bigint, timestamp, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";

/**
 * Clave primaria UUIDv7: ordenada en el tiempo, así los índices B-tree crecen
 * al final (como un serial) y no se fragmentan como con UUIDv4.
 */
export const id = () => uuid().primaryKey().$defaultFn(uuidv7);

/** Columna de clave foránea a un `id()`. La FK se declara con `.references()`. */
export const ref = () => uuid();

/** Instante absoluto. Siempre con zona horaria; la UI lo muestra en America/Argentina/Buenos_Aires. */
export const tstz = () => timestamp({ withTimezone: true, mode: "date" });

/**
 * Importes en CENTAVOS de ARS como entero. Nunca float: evita errores de redondeo
 * y suma rápido. `mode: "number"` es seguro hasta ~90 billones de pesos.
 */
export const money = () => bigint({ mode: "number" });

export const createdAt = () => tstz().notNull().defaultNow();

export const timestamps = {
  createdAt: createdAt(),
  updatedAt: tstz()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
