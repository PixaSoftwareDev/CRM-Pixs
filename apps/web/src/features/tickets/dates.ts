/** Fechas del detalle del ticket (compromiso y llamada de confirmación). */
import { addDays, toHHMM, toInstant } from "../tasks/time";

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
  const tomorrow = addDays(today, 1);
  return [
    ...(inTwo <= 19 * 60 ? [{ label: `Hoy ${toHHMM(inTwo)}`, at: toInstant(today, toHHMM(inTwo)) }] : []),
    { label: "Mañana 10:00", at: toInstant(tomorrow, "10:00") },
    { label: "Pasado mañana 10:00", at: toInstant(addDays(tomorrow, 1), "10:00") },
  ];
}
