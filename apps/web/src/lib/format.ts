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

/** "hoy 15:00", "mañana 10:00", "ayer", "14/09"; de otro año, "01/01/2020" (sin el año se leía "1/1" a secas). */
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
  const otherYear = arDay(date).slice(0, 4) !== arDay(new Date()).slice(0, 4);
  return `${(otherYear ? dateFmt : shortFmt).format(date)}${time}`;
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

/** Recorta un texto largo para avisos y subtítulos: clip("una tarea con título muy largo…", 20). */
export const clip = (text: string, max = 80) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** plural(1, "activo", "activos") → "1 activo". */
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Centavos → texto para un input de pesos ("1234,56"), el inverso de parsePesos.
 * Con punto decimal parsePesos lo tomaba como miles y multiplicaba el monto por 100.
 */
export const centsToInput = (cents: number) =>
  (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2)).replace(".", ",");

/**
 * Un número escrito a mano, en pesos → número (sin redondear). null si no se entiende.
 * - Con coma: la coma es decimal y los puntos, de miles ("1.500,50", "1500,5").
 * - Sin coma, un único punto con 1 o 2 dígitos al final: punto decimal ("1500.50", "1.5").
 * - Puntos en grupos de 3: miles ("150.000", "1.500.000").
 */
export function parseDecimal(input: string): number | null {
  const s = input.replace(/[$\s]/g, "");
  let plain: string;
  if (s.includes(",")) {
    if (!/^(\d{1,3}(\.\d{3})+|\d+)?,\d*$/.test(s) || s === ",") return null;
    plain = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d+\.\d{1,2}$/.test(s)) {
    plain = s;
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s) || /^\d+$/.test(s)) {
    plain = s.replace(/\./g, "");
  } else {
    return null;
  }
  const n = Number(plain);
  return Number.isFinite(n) ? n : null;
}

/** "150.000,50", "1500.50" o "150000" (pesos escritos a mano) → centavos. 0 si está vacío, null si no es un número. */
export function parsePesos(input: string): number | null {
  if (input.replace(/[$\s]/g, "") === "") return 0;
  const n = parseDecimal(input);
  return n === null ? null : Math.round(n * 100);
}
