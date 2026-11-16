/**
 * Fechas y horas de la agenda, siempre en hora de Argentina sin importar la zona
 * de la computadora. Los días viajan como "YYYY-MM-DD" y las horas como "HH:MM".
 */
const TZ = "America/Argentina/Buenos_Aires";
/** Argentina no tiene horario de verano desde 2009. */
const AR_OFFSET = "-03:00";

const DAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const partsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Instante ISO → día, hora y minutos desde medianoche, en Argentina. */
export function arParts(iso: string): { date: string; time: string; minutes: number } {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  const time = `${p.hour}:${p.minute}`;
  return { date: `${p.year}-${p.month}-${p.day}`, time, minutes: toMinutes(time) };
}

/** Día y hora de Argentina → instante ISO (lo que guarda la API). */
export const toInstant = (date: string, time: string) => new Date(`${date}T${time}:00${AR_OFFSET}`).toISOString();

export const todayAr = () => arParts(new Date().toISOString()).date;
export const nowMinutesAr = () => arParts(new Date().toISOString()).minutes;

// Aritmética de días en UTC: un "YYYY-MM-DD" no tiene zona, así no hay corrimientos.
const utc = (date: string) => new Date(`${date}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export const addDays = (date: string, n: number) => iso(new Date(utc(date).getTime() + n * 86_400_000));

export function addMonths(date: string, n: number): string {
  const d = utc(date);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  return iso(d);
}

/** 0 = domingo … 6 = sábado. */
export const weekday = (date: string) => utc(date).getUTCDay();

/** Lunes de la semana del día dado. */
export const weekStart = (date: string) => addDays(date, -((weekday(date) + 6) % 7));

export const toMinutes = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** Minutos → "HH:MM"; pasada la medianoche sigue en el día siguiente (24:30 → 00:30). */
export const toHHMM = (minutes: number) => {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** Duración entre "desde" y "hasta"; si "hasta" es menor, termina al día siguiente (22:00–01:00 = 180). */
export const spanMinutes = (start: string, end: string) => {
  const d = toMinutes(end) - toMinutes(start);
  return d < 0 ? d + 1440 : d;
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Viernes 13 de noviembre" */
export function dayTitle(date: string): string {
  const d = utc(date);
  return `${cap(DAYS[d.getUTCDay()] ?? "")} ${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]}`;
}

/** "vie 13/11" (con año si no es el actual). */
export function shortDay(date: string): string {
  const d = utc(date);
  const year = d.getUTCFullYear() === utc(todayAr()).getUTCFullYear() ? "" : `/${d.getUTCFullYear()}`;
  return `${DAYS[d.getUTCDay()]?.slice(0, 3)} ${d.getUTCDate()}/${d.getUTCMonth() + 1}${year}`;
}

/** "noviembre 2026" */
export const monthTitle = (date: string) => {
  const d = utc(date);
  return `${cap(MONTHS[d.getUTCMonth()] ?? "")} ${d.getUTCFullYear()}`;
};

/** "9 – 15 de noviembre" o "30 de noviembre – 6 de diciembre". */
export function weekTitle(monday: string): string {
  const a = utc(monday);
  const b = utc(addDays(monday, 6));
  const ma = MONTHS[a.getUTCMonth()];
  const mb = MONTHS[b.getUTCMonth()];
  return ma === mb
    ? `${a.getUTCDate()} – ${b.getUTCDate()} de ${mb} ${b.getUTCFullYear()}`
    : `${a.getUTCDate()} de ${ma} – ${b.getUTCDate()} de ${mb} ${b.getUTCFullYear()}`;
}

/** 90 → "1 h 30 min" */
export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h} h` : "", m ? `${m} min` : ""].filter(Boolean).join(" ");
}

/** Días de la grilla mensual (semanas completas de lunes a domingo). */
export function monthGrid(date: string): string[] {
  const first = `${date.slice(0, 7)}-01`;
  const start = weekStart(first);
  const nextMonth = addMonths(first, 1);
  const days: string[] = [];
  for (let d = start; d < nextMonth || days.length % 7 !== 0; d = addDays(d, 1)) days.push(d);
  return days;
}

/** Próxima media hora redonda dentro del horario laboral (08:00–19:00), para sugerir. */
export function nextSlot(): string {
  const next = Math.ceil((nowMinutesAr() + 1) / 30) * 30;
  return toHHMM(Math.min(19 * 60, Math.max(8 * 60, next)));
}
