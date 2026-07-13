import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { projects } from "./projects"
import { users } from "./users"

/** Columnas del kanban de tareas (estilo Trello, §3). */
export const TASK_COLUMNS = ["backlog", "en_curso", "revision", "hecho"] as const
export type TaskColumn = (typeof TASK_COLUMNS)[number]

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    titulo: text("titulo").notNull(),
    descripcion: text("descripcion"),
    estado: text("estado").notNull().default("backlog").$type<TaskColumn>(),
    orden: integer("orden").notNull().default(0), // para el ordenamiento en D&D
    asignadoA: text("asignado_a").references(() => users.id),
    venceAt: integer("vence_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("tasks_project_idx").on(t.projectId, t.estado, t.orden)],
)

export const taskChecklistItems = sqliteTable("task_checklist_items", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  texto: text("texto").notNull(),
  completado: integer("completado", { mode: "boolean" }).notNull().default(false),
  orden: integer("orden").notNull().default(0),
})

export type Task = typeof tasks.$inferSelect
export type NewTask = typeof tasks.$inferInsert
export type ChecklistItem = typeof taskChecklistItems.$inferSelect
