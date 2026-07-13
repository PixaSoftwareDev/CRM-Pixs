import { asc, eq } from "drizzle-orm"
import { db } from "@/db"
import { tasks, users } from "@/db/schema"

export type TaskRow = Awaited<ReturnType<typeof listTasks>>[number]

export async function listTasks(projectId: string) {
  return db
    .select({
      id: tasks.id,
      titulo: tasks.titulo,
      descripcion: tasks.descripcion,
      estado: tasks.estado,
      orden: tasks.orden,
      venceAt: tasks.venceAt,
      asignadoA: tasks.asignadoA,
      asignadoNombre: users.nombre,
    })
    .from(tasks)
    .leftJoin(users, eq(tasks.asignadoA, users.id))
    .where(eq(tasks.projectId, projectId))
    .orderBy(asc(tasks.orden))
}
