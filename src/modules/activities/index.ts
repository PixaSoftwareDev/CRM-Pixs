import { and, desc, eq } from "drizzle-orm"
import { db } from "@/db"
import { type ActivityEntity, type ActivityType, activities, users } from "@/db/schema"

export async function listActivities(entityType: ActivityEntity, entityId: string) {
  return db
    .select({
      id: activities.id,
      tipo: activities.tipo,
      contenido: activities.contenido,
      archivoUrl: activities.archivoUrl,
      createdAt: activities.createdAt,
      autorNombre: users.nombre,
    })
    .from(activities)
    .leftJoin(users, eq(activities.autorId, users.id))
    .where(and(eq(activities.entityType, entityType), eq(activities.entityId, entityId)))
    .orderBy(desc(activities.createdAt))
}

/** Crea una entrada de timeline. Se llama desde los service de cada dominio. */
export async function addActivity(input: {
  tipo: ActivityType
  entityType: ActivityEntity
  entityId: string
  contenido?: string
  archivoUrl?: string
  autorId?: string
}) {
  await db.insert(activities).values(input)
}
