import { type KeyboardEvent, useEffect, useId, useRef } from "react";
import { cn } from "../../components/ui/cn";
import { Skeleton } from "../../components/ui/States";
import { type Availability, agendaOf, type BusyEntry, clashText, slotsOf } from "./availability";
import { toHHMM } from "./time";

const MOVE: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * Turnos de 30 minutos del responsable para el día, como al sacar un turno: los
 * libres se eligen (fijan "desde" y corren "hasta" con la misma duración) y los
 * ocupados se ven tachados con lo que los ocupa. Un solo Tab entra al grupo y las
 * flechas recorren los turnos. Debajo, si el horario cargado a mano se pisa, avisa.
 */
export function SlotPicker({
  availability: a,
  start,
  duration,
  who,
  onPick,
  className,
}: {
  availability: Availability;
  /** "Desde" actual ("HH:MM"), para marcar el turno elegido. */
  start: string;
  duration: number;
  /** Nombre del responsable, para los avisos. */
  who: string;
  onPick: (start: string) => void;
  className?: string;
}) {
  const labelId = useId();
  const group = useRef<HTMLDivElement>(null);
  // En el celular los turnos son una tira que scrollea de costado: el elegido queda a la vista
  // (solo se mueve la tira, no el modal).
  useEffect(() => {
    const el = group.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const on = el.querySelector<HTMLElement>('button[aria-pressed="true"]') ?? el.querySelector<HTMLElement>("button[tabindex='0']");
    if (on) el.scrollLeft = on.offsetLeft - (el.clientWidth - on.offsetWidth) / 2;
  }, [start, a.query?.isPending, a.query?.data]);
  if (!a.query) return null;

  const slots = slotsOf(a, duration);
  const free = slots.filter((s) => !s.blockedBy);
  const selected = slots.find((s) => toHHMM(s.start) === start);
  // El que recibe el Tab: el elegido, si no el primer libre.
  const tabStop = (selected ?? free[0] ?? slots[0])?.start;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const buttons = [...(group.current?.querySelectorAll<HTMLButtonElement>("button[data-slot]") ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const step = MOVE[e.key];
    const next =
      step !== undefined ? buttons[i + step] : e.key === "Home" ? buttons[0] : e.key === "End" ? buttons.at(-1) : undefined;
    if (!next) return;
    e.preventDefault();
    next.focus();
  };

  const busyTitle = (s: number, b: BusyEntry) =>
    b.start <= s ? `Ocupado: ${b.title} (${b.range})` : `No entra: a las ${toHHMM(b.start)} empieza "${b.title}"`;

  let body: React.ReactNode;
  if (a.query.isPending) {
    body = (
      <div className="flex gap-1.5 overflow-hidden sm:flex-wrap" aria-hidden>
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-14 shrink-0 sm:h-8" />
        ))}
      </div>
    );
  } else if (a.query.error) {
    body = (
      <p role="alert" className="text-xs text-red-700">
        No se pudo ver {agendaOf(who)}.{" "}
        <button type="button" className="font-semibold underline" onClick={() => void a.query?.refetch()}>
          Reintentar
        </button>
      </p>
    );
  } else if (a.past) {
    body = <p className="text-xs text-muted">Ese día ya pasó: cargá el horario a mano.</p>;
  } else {
    body = (
      <>
        {free.length === 0 && <p className="text-xs font-medium text-amber-800">No hay horarios libres ese día.</p>}
        {slots.length > 0 && (
          <div
            ref={group}
            role="group"
            aria-labelledby={labelId}
            onKeyDown={onKeyDown}
            // Celular: una tira horizontal con imán (en vez de una pared de turnos); desde sm, en filas.
            className="relative flex snap-x scroll-px-4 gap-1.5 overflow-x-auto overscroll-x-contain max-sm:-mx-4 max-sm:px-4 max-sm:pb-1 sm:flex-wrap sm:overflow-visible"
          >
            {slots.map((s) => {
              const hhmm = toHHMM(s.start);
              const on = s === selected && !s.blockedBy;
              return (
                <button
                  key={s.start}
                  type="button"
                  data-slot
                  tabIndex={s.start === tabStop ? 0 : -1}
                  aria-pressed={on}
                  aria-disabled={s.blockedBy ? true : undefined}
                  title={s.blockedBy ? busyTitle(s.start, s.blockedBy) : `Libre desde las ${hhmm}`}
                  onClick={() => !s.blockedBy && onPick(hhmm)}
                  className={cn(
                    "min-h-10 shrink-0 snap-start rounded-lg border px-2.5 text-xs font-semibold tabular-nums outline-none transition focus-visible:ring-2 focus-visible:ring-brand/40 sm:min-h-8 sm:px-2",
                    s.blockedBy
                      ? "cursor-not-allowed border-transparent bg-slate-100 text-slate-400 line-through"
                      : on
                        ? "border-brand bg-brand text-white"
                        : "border-line bg-white text-ink hover:border-brand hover:text-brand",
                  )}
                >
                  {hhmm}
                  {s.blockedBy && <span className="sr-only"> (ocupado)</span>}
                </button>
              );
            })}
          </div>
        )}
      </>
    );
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)} aria-busy={a.query.isPending || undefined}>
      <span id={labelId} className="text-xs font-semibold text-slate-600">
        {who === "vos" ? "Tus horarios libres" : `Horarios libres de ${who}`}
      </span>
      {body}
      {a.clash && (
        <p role="status" className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
          {clashText(a.clash, who)}
        </p>
      )}
    </div>
  );
}
