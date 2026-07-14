import { asc, desc, eq } from "drizzle-orm"
import { db } from "@/db"
import { projects, tasks, users } from "@/db/schema"

export type TaskRow = Awaited<ReturnType<typeof listTasks>>[number]

export async function listTasks(projectId: string) {
  return db
    .select({
      id: tasks.id,
      titulo: tasks.titulo,
      descripcion: tasks.descripcion,
      color: tasks.color,
      estado: tasks.estado,
      orden: tasks.orden,
      venceAt: tasks.venceAt,
      asignados: tasks.asignados,
    })
    .from(tasks)
    .where(eq(tasks.projectId, projectId))
    .orderBy(asc(tasks.orden))
}

export type GlobalTaskRow = Awaited<ReturnType<typeof listAllTasks>>[number]

/** Todas las tareas de todos los proyectos, para la pestaña global. */
export async function listAllTasks() {
  return db
    .select({
      id: tasks.id,
      titulo: tasks.titulo,
      descripcion: tasks.descripcion,
      color: tasks.color,
      estado: tasks.estado,
      venceAt: tasks.venceAt,
      cerradoAt: tasks.cerradoAt,
      createdAt: tasks.createdAt,
      projectId: tasks.projectId,
      proyectoNombre: projects.nombre,
      asignados: tasks.asignados,
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .orderBy(desc(tasks.createdAt))
}

export type ProjectOption = Awaited<ReturnType<typeof listProjectOptions>>[number]

/** Proyectos (id + nombre) para poblar el filtro de la pestaña de tareas. */
export async function listProjectOptions() {
  return db
    .select({ id: projects.id, nombre: projects.nombre })
    .from(projects)
    .orderBy(asc(projects.nombre))
}

export type UserOption = Awaited<ReturnType<typeof listUsers>>[number]

/** Usuarios (id + nombre) para el selector de responsable. */
export async function listUsers() {
  return db.select({ id: users.id, nombre: users.nombre }).from(users).orderBy(asc(users.nombre))
}
