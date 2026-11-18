/**
 * Disponibilidad de la agenda del responsable para un día: qué ratos ya están
 * ocupados, si el horario elegido se pisa con algo y el "¿agendar igual?".
 */
import { type BusyBlock, type BusyTaskDto, daySlots, firstOverlap } from "@crm/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ApiError, api } from "../../lib/api";
import { arParts, nowMinutesAr, spanMinutes, todayAr, toInstant, toMinutes } from "./time";

const HHMM = /^\d{2}:\d{2}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Una tarea que ocupa la agenda, en minutos desde la medianoche del día que se mira. */
export interface BusyEntry extends BusyBlock {
  id: string;
  title: string;
  /** "10:00–11:00" */
  range: string;
}

/** Tareas ocupadas → bloques del día (lo que viene de ayer empieza en negativo). */
export function toBlocks(date: string, busy: readonly BusyTaskDto[]): BusyEntry[] {
  const midnight = Date.parse(toInstant(date, "00:00"));
  return busy.map((b) => ({
    id: b.id,
    title: b.title,
    start: (Date.parse(b.startsAt) - midnight) / 60_000,
    end: (Date.parse(b.endsAt) - midnight) / 60_000,
    range: `${arParts(b.startsAt).time}–${arParts(b.endsAt).time}`,
  }));
}

/** Rango [desde, hasta) en minutos del día; "hasta" menor que "desde" = termina al día siguiente. */
export function rangeOf(start: string, end: string): { start: number; end: number } | null {
  if (!HHMM.test(start) || !HHMM.test(end)) return null;
  const span = spanMinutes(start, end);
  return span > 0 ? { start: toMinutes(start), end: toMinutes(start) + span } : null;
}

export const clashText = (b: BusyEntry, who: string) =>
  `Ese horario se pisa con "${b.title}" (${b.range}) en ${agendaOf(who)}.`;

/** "tu agenda" si es de quien usa la app ("vos"), si no "la agenda de Ana". */
export const agendaOf = (who: string) => (who === "vos" ? "tu agenda" : `la agenda de ${who}`);

/** El server rechazó el horario porque está ocupado (se puede agendar igual). */
export const isOverlapError = (err: unknown): err is ApiError => err instanceof ApiError && err.status === 409;

/**
 * Ocupación del responsable en el día y choque del horario elegido. `excludeId`
 * es la tarea que se está editando: su propio horario no cuenta.
 */
export function useAvailability(p: {
  assigneeId: string | undefined;
  date: string | undefined;
  start: string | undefined;
  end: string | undefined;
  excludeId?: string;
}) {
  const { assigneeId = "", date = "", excludeId } = p;
  const enabled = !!assigneeId && DAY.test(date);
  const query = useQuery({
    queryKey: ["tasks", "busy", assigneeId, date, excludeId ?? ""] as const,
    queryFn: () => api.get<BusyTaskDto[]>("/api/tasks/busy", { assigneeId, date, excludeId }),
    enabled,
  });
  const blocks = enabled && query.data ? toBlocks(date, query.data) : [];
  const range = rangeOf(p.start ?? "", p.end ?? "");
  const clash = range ? firstOverlap(blocks, range.start, range.end) : undefined;
  const today = todayAr();
  return {
    query: enabled ? query : null,
    blocks,
    clash,
    /** Ese día ya pasó: no se ofrecen turnos. */
    past: enabled && date < today,
    /** Desde cuándo ofrecer turnos (hoy, lo que ya pasó no). */
    notBefore: date === today ? nowMinutesAr() : undefined,
  };
}

export type Availability = ReturnType<typeof useAvailability>;

/** Turnos del día para la duración dada. */
export const slotsOf = (a: Availability, duration: number) =>
  daySlots(a.blocks, { duration, ...(a.notBefore !== undefined && { notBefore: a.notBefore }) });

/**
 * "¿Agendar igual?": si el horario se pisa (lo vio el front o lo rechazó el
 * server con 409) se frena el guardado y se pregunta; confirmar reintenta con
 * `allowOverlap`.
 */
export function useOverlapGate(
  /** Si cambia (otro día, horario o responsable), la pregunta pendiente ya no vale. */
  resetKey: string,
) {
  const [ask, setAsk] = useState<{ message: string; retry: () => void } | null>(null);
  useEffect(() => setAsk(null), [resetKey]);

  const run = async (clash: string | null, save: (allowOverlap: boolean) => Promise<void>) => {
    const retry = () => {
      setAsk(null);
      // Si falla por otra cosa, el error lo muestra la mutación.
      save(true).catch(() => undefined);
    };
    if (clash) {
      setAsk({ message: clash, retry });
      return;
    }
    try {
      await save(false);
    } catch (err) {
      if (!isOverlapError(err)) throw err;
      setAsk({ message: err.message, retry });
    }
  };

  return { ask, run, cancel: () => setAsk(null) };
}
