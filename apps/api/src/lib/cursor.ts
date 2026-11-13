import type { z } from "zod";
import { BadRequestError } from "./errors";

/**
 * Paginación por cursor (keyset): el cursor es la clave de orden de la última fila,
 * codificada en base64url. Escala igual en la página 1 que en la 1000 (OFFSET no).
 */
export function encodeCursor(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function decodeCursor<T>(cursor: string | undefined, schema: z.ZodType<T>): T | null {
  if (!cursor) return null;
  try {
    return schema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
  } catch {
    throw new BadRequestError("Cursor inválido");
  }
}

/** Pide `limit + 1` filas: si vuelve una de más, hay página siguiente. */
export function toPage<T, C>(rows: T[], limit: number, cursorOf: (last: T) => C) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return { items, nextCursor: hasMore && last ? encodeCursor(cursorOf(last)) : null };
}

/** Escapa comodines de LIKE para que el texto del usuario se busque literal. */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
