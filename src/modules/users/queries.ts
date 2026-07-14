import { asc } from "drizzle-orm"
import { db } from "@/db"
import { users } from "@/db/schema"

export type UserOption = { id: string; nombre: string }

/** Usuarios (id + nombre) para selectores de responsable / quién pagó. */
export async function listUsers(): Promise<UserOption[]> {
  return db.select({ id: users.id, nombre: users.nombre }).from(users).orderBy(asc(users.nombre))
}
