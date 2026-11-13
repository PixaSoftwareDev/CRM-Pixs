import { createDb } from "@pixs/db";
import { env } from "../env";

/** Pool único del proceso. Se cierra en el shutdown (ver index.ts). */
export const { db, close: closeDb } = createDb(env.DATABASE_URL, { max: env.DATABASE_POOL_MAX });
