/**
 * Contratos de Tareas ("Mi día" y "Agenda" son la misma entidad: una tarea con
 * fecha y hora es un evento de agenda).
 */
import { z } from "zod";

export const TASK_STATUSES = ["pendiente", "en_curso", "esperando", "hecha", "cancelada"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Una consulta de agenda no puede pedir más de 6 semanas (vista mensual + bordes). */
export const MAX_RANGE_DAYS = 42;

const isoDate = z.iso.date({ message: "Fecha inválida" });
const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, { message: "Color inválido" });
const title = z.string().trim().min(1, { message: "Escribí qué hay que hacer" }).max(200);
const minutes = z.number().int().min(5).max(24 * 60);

export const taskRangeQuery = z
  .object({ from: isoDate, to: isoDate })
  .refine((v) => v.from <= v.to, { message: "El rango está invertido", path: ["to"] })
  .refine((v) => (Date.parse(v.to) - Date.parse(v.from)) / 86_400_000 < MAX_RANGE_DAYS, {
    message: `El rango no puede superar ${MAX_RANGE_DAYS} días`,
    path: ["to"],
  });
export type TaskRangeQuery = z.infer<typeof taskRangeQuery>;

export const taskCreate = z.object({
  title,
  typeId: z.uuid(),
  clientId: z.uuid().nullable().optional(),
  projectId: z.uuid().nullable().optional(),
  /** Si no viene, la tarea es de quien la crea. */
  assigneeId: z.uuid().optional(),
  /** null = sin agendar. */
  startsAt: z.iso.datetime({ offset: true }).nullable().optional(),
  durationMinutes: minutes.default(60),
});
export type TaskCreate = z.input<typeof taskCreate>;

export const taskUpdate = z
  .object({
    title,
    typeId: z.uuid(),
    clientId: z.uuid().nullable(),
    assigneeId: z.uuid(),
    startsAt: z.iso.datetime({ offset: true }).nullable(),
    durationMinutes: minutes,
    status: z.enum(TASK_STATUSES),
    /** Comentario que se guarda junto con los cambios ("Guardar" del modal). */
    comment: z.string().trim().max(2000),
  })
  .partial();
export type TaskUpdate = z.input<typeof taskUpdate>;

export const taskCommentCreate = z.object({
  body: z.string().trim().min(1, { message: "Escribí el comentario" }).max(2000),
});
export type TaskCommentCreate = z.input<typeof taskCommentCreate>;

export const taskTypeCreate = z.object({
  name: z.string().trim().min(1, { message: "Poné un nombre" }).max(40),
  color: hexColor,
});
export type TaskTypeCreate = z.input<typeof taskTypeCreate>;
