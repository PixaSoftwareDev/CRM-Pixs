/** Fechas del detalle del ticket (compromiso y llamada de confirmación). */
import { addDays, shortDay, toHHMM, toInstant } from "../tasks/time";

/**
 * Fecha de compromiso completa y razonable. Mientras se tipea con el teclado el
 * input pasa por valores como "0002-12-25": esos no se guardan.
 */
export function validDue(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return y >= 2000 && y <= 2100 && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * Opciones rápidas para agendar la llamada de confirmación. "Hoy" (en dos horas,
 * redondeado al cuarto de hora) solo si todavía entra antes de las 19: si no,
 * ofrecía un horario que ya había pasado.
 */
export function confirmSlots(nowMinutes: number, today: string) {
  const inTwo = Math.ceil((nowMinutes + 120) / 15) * 15;
  // Días hábiles, como las tareas automáticas del server: un viernes, "mañana" es el lunes.
  const first = nextWorkday(today);
  const second = nextWorkday(first);
  const name = (d: string) =>
    d === addDays(today, 1) ? "Mañana" : d === addDays(today, 2) ? "Pasado mañana" : capitalize(shortDay(d));
  return [
    ...(isWorkday(today) && inTwo <= 19 * 60 ? [{ label: `Hoy ${toHHMM(inTwo)}`, at: toInstant(today, toHHMM(inTwo)) }] : []),
    { label: `${name(first)} 10:00`, at: toInstant(first, "10:00") },
    { label: `${name(second)} 10:00`, at: toInstant(second, "10:00") },
  ];
}

const weekday = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
const isWorkday = (d: string) => weekday(d) !== 0 && weekday(d) !== 6;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** El siguiente día de lunes a viernes después de `d`. */
export function nextWorkday(d: string): string {
  let next = addDays(d, 1);
  while (!isWorkday(next)) next = addDays(next, 1);
  return next;
}
