import { sql } from "@crm/db";

/** Hoy en Argentina como `date` de Postgres (los vencimientos son días locales, no UTC). */
export const todayAr = sql`(now() at time zone 'America/Argentina/Buenos_Aires')::date`;

/** Convierte bigint/numeric de Postgres (llegan como string) a number. */
export const toNumber = (v: unknown): number => Number(v ?? 0);

/** Normaliza un timestamp crudo (Date o string) a ISO 8601. */
export const toIso = (v: unknown): string => new Date(v as string | Date).toISOString();
