/**
 * Disponibilidad de la agenda: qué horarios de una persona ya están ocupados.
 * Como en un turno de la VTV o del médico, se ofrecen solo los horarios libres.
 * La lógica es pura (minutos) y la usan tanto la API como el front.
 */
import { z } from "zod";

/**
 * Estados que ocupan lugar en la agenda. Una tarea finalizada o cancelada ya no
 * bloquea su horario (si terminó antes, ese rato quedó libre).
 */
export const BUSY_STATUSES = ["pendiente", "en_curso", "esperando"] as const;

/** Horario en que se ofrecen turnos (no hay horario laboral configurable). */
export const SLOT_DAY_START = 7 * 60;
export const SLOT_DAY_END = 21 * 60;
export const SLOT_STEP = 30;

export const taskBusyQuery = z.object({
  assigneeId: z.uuid({ message: "Elegí el responsable" }),
  date: z.iso.date({ message: "Fecha inválida" }),
  /** La tarea que se está editando: su propio horario no cuenta como ocupado. */
  excludeId: z.uuid().optional(),
});
export type TaskBusyQuery = z.input<typeof taskBusyQuery>;

/** Una tarea que ocupa la agenda (lo que devuelve `GET /api/tasks/busy`). */
export interface BusyTaskDto {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
}

/** Un rato ocupado, en minutos (desde la medianoche del día que se mira, puede ser negativo o pasar de 1440). */
export interface BusyBlock {
  start: number;
  end: number;
}

/** Dos rangos semiabiertos [inicio, fin) se pisan: 10:00–11:00 y 11:00–12:00 no. */
export const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && bStart < aEnd;

/** El primer ocupado (el que empieza antes) que se pisa con [start, end), si hay. */
export function firstOverlap<T extends BusyBlock>(busy: readonly T[], start: number, end: number): T | undefined {
  return busy
    .filter((b) => overlaps(start, end, b.start, b.end))
    .sort((a, b) => a.start - b.start)[0];
}

export interface Slot<T extends BusyBlock = BusyBlock> {
  /** Minutos desde la medianoche. */
  start: number;
  /** Lo que lo ocupa; sin esto el turno está libre para toda la duración. */
  blockedBy?: T;
}

/**
 * Turnos del día cada `step` minutos entre `from` (inclusive) y `to` (exclusive).
 * Un turno está libre solo si entra la duración completa: una tarea de 1 h no
 * puede empezar en una media hora libre seguida de una ocupada. Los turnos que
 * empiezan antes de `notBefore` (hoy, lo que ya pasó) no se ofrecen.
 */
export function daySlots<T extends BusyBlock>(
  busy: readonly T[],
  opts: { duration: number; from?: number; to?: number; step?: number; notBefore?: number },
): Slot<T>[] {
  const { duration, from = SLOT_DAY_START, to = SLOT_DAY_END, step = SLOT_STEP, notBefore = -Infinity } = opts;
  const len = Math.max(1, duration);
  const slots: Slot<T>[] = [];
  for (let s = from; s < to; s += step) {
    if (s < notBefore) continue;
    const blockedBy = firstOverlap(busy, s, s + len);
    slots.push(blockedBy ? { start: s, blockedBy } : { start: s });
  }
  return slots;
}
