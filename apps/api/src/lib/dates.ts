/** Fechas legibles en hora de Argentina, para los registros automáticos. */
const whenFmt = new Intl.DateTimeFormat("es-AR", {
  weekday: "short",
  day: "numeric",
  month: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "America/Argentina/Buenos_Aires",
});

/** "vie 9/11 10:00" (armado por partes: el separador de Intl cambia entre versiones de ICU). */
export function fmtWhen(iso: string | Date): string {
  const p = Object.fromEntries(whenFmt.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.weekday?.replace(".", "")} ${p.day}/${p.month} ${p.hour}:${p.minute}`;
}

/** Fin del día de Argentina ("YYYY-MM-DD" → 23:59 -03:00): un compromiso vence al terminar el día. */
export const endOfDayAr = (date: string) => new Date(`${date}T23:59:00-03:00`);

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
const hourFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", hourCycle: "h23" });

/** Día de hoy en Argentina ("YYYY-MM-DD"). */
export const todayArIso = (now = new Date()) => dayFmt.format(now);
/** Hora actual en Argentina (0-23). */
export const hourAr = (now = new Date()) => Number(hourFmt.format(now));

/** Próximo día hábil (lunes a viernes) a la hora dada, en hora de Argentina. */
export function nextWorkdayAt(hhmm: string, now = new Date()): Date {
  let d = new Date(`${todayArIso(now)}T00:00:00Z`);
  do d = new Date(d.getTime() + 86_400_000);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return new Date(`${d.toISOString().slice(0, 10)}T${hhmm}:00-03:00`);
}
