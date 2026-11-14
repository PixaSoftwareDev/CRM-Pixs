const TZ = "America/Argentina/Buenos_Aires";

const moneyFmt = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});
const moneyCentsFmt = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Centavos → "$ 150.000"; si hay centavos, "$ 12.500,50" (no se redondean para que los saldos cierren). */
export const money = (cents: number) => (cents % 100 === 0 ? moneyFmt : moneyCentsFmt).format(cents / 100);

const dateFmt = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TZ });
const shortFmt = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", timeZone: TZ });
const timeFmt = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TZ });

/** "YYYY-MM-DD" (fecha sin hora) → "14/09/2026", sin corrimiento por zona horaria. */
export function day(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

export const fullDate = (iso: string) => dateFmt.format(new Date(iso));

/** Día calendario en Argentina como "YYYY-MM-DD". */
function arDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(date);
}

export const todayIso = () => arDay(new Date());

/** "hoy 15:00", "mañana 10:00", "ayer", "14/09". */
export function when(iso: string | null | undefined, withTime = true): string {
  if (!iso) return "sin fecha";
  const date = new Date(iso);
  const diff = Math.round(
    (Date.parse(arDay(date)) - Date.parse(arDay(new Date()))) / 86_400_000,
  );
  const time = withTime ? ` ${timeFmt.format(date)}` : "";
  if (diff === 0) return `hoy${time}`;
  if (diff === 1) return `mañana${time}`;
  if (diff === -1) return `ayer${time}`;
  return `${shortFmt.format(date)}${time}`;
}

/** "hace 3 días", "hoy", "hace 2 meses". */
export function ago(iso: string | null | undefined): string {
  if (!iso) return "nunca";
  const days = Math.floor((Date.parse(todayIso()) - Date.parse(arDay(new Date(iso)))) / 86_400_000);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  return months === 1 ? "hace 1 mes" : `hace ${months} meses`;
}

/** Iniciales para avatares: "Panadería La Espiga" → "PE". */
export function initials(name: string): string {
  const words = name.split(/\s+/).filter((w) => /^\p{Lu}/u.test(w));
  return (words.length ? words : name.split(/\s+/))
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

/** plural(1, "activo", "activos") → "1 activo". */
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "150.000,50" o "150000" (pesos escritos a mano) → centavos. null si no es un número. */
export function parsePesos(input: string): number | null {
  const clean = input.replace(/[$\s]/g, "").replace(/\./g, "").replace(",", ".");
  if (clean === "") return 0;
  const n = Number(clean);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}
