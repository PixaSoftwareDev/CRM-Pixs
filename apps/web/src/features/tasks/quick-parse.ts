/**
 * Carga rápida de "Mi día": de una frase ("llamar a La Espiga mañana 10hs por
 * la cuota") saca cliente, tipo, día y hora. Es una sugerencia: el usuario
 * siempre la confirma en el formulario antes de agendar.
 */
import { addDays, toHHMM, weekday } from "./time";

export interface QuickDraft {
  title: string;
  clientId: string | null;
  typeName: string | null;
  date: string;
  start: string;
  durationMinutes: number;
  /** Algo de la frase que no se pudo usar (p. ej. una fecha que no existe), para avisarle al usuario. */
  warning: string | null;
}

interface Options {
  clients: readonly { id: string; name: string }[];
  /** Día que se está mirando en "Mi día". */
  baseDate: string;
  /** Hora sugerida si la frase no dice ninguna. */
  defaultStart: string;
}

const norm = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Palabras de nombres de cliente que no identifican a nadie por sí solas. */
const GENERIC = new Set([
  "panaderia", "estudio", "gimnasio", "clinica", "colegio", "asoc", "asociados",
  "comercial", "empresa", "grupo", "servicios", "consultora", "centro", "tienda",
]);

const TYPE_RULES: [RegExp, string][] = [
  [/\b(cobr|cuota|pago|deuda)/, "Cobranza"],
  [/\b(reuni|demo|juntarse|visita)/, "Reunión"],
  [/\b(llam|telefon)/, "Llamada"],
  [/\b(propuesta|presupuest|cotiz)/, "Ventas"],
  [/\b(falla|error|no anda|se cayo|bug)/, "Falla"],
  [/\b(implement|instal|configur|migr)/, "Implementación"],
];

const WEEKDAYS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

function matchClient(text: string, clients: Options["clients"]): string | null {
  let best: { id: string; score: number } | null = null;
  for (const c of clients) {
    const words = norm(c.name)
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && !GENERIC.has(w) && !["del", "las", "los"].includes(w));
    const score = words.filter((w) => new RegExp(`\\b${w}\\b`).test(text)).length;
    if (score > 0 && (!best || score > best.score)) best = { id: c.id, score };
  }
  return best?.id ?? null;
}

/** "2026-11-31" no existe aunque Date.parse lo acepte (lo corre al 1/12). */
function realDate(year: number, month: number, day: number): string | null {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d.toISOString().slice(0, 10);
}

function matchDate(text: string, base: string): { date: string; warning: string | null } {
  const ok = (date: string) => ({ date, warning: null });
  if (/\bpasado manana\b/.test(text)) return ok(addDays(base, 2));
  // "mañana" es el día siguiente; "por/a/de la mañana" es un horario, no un día.
  if (/(?<!\bla )\bmanana\b/.test(text)) return ok(addDays(base, 1));
  const dm = text.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (dm) {
    const date = realDate(Number(base.slice(0, 4)), Number(dm[2]), Number(dm[1]));
    if (date) return ok(date);
    return { date: base, warning: `La fecha ${dm[0]} no existe: revisá el día antes de agendar.` };
  }
  // Solo "el viernes", "este viernes", "para el viernes", "próximo viernes": un "viernes" suelto
  // en la descripción ("la prueba del viernes") no mueve la tarea de día.
  const wd = WEEKDAYS.findIndex((d) => new RegExp(`\\b(?:el|este|para|proximo)\\s+(?:proximo\\s+)?${d}\\b`).test(text));
  if (wd >= 0) {
    // El próximo día con ese nombre (si es hoy, el de la semana que viene).
    const diff = (wd - weekday(base) + 7) % 7 || 7;
    return ok(addDays(base, diff));
  }
  return ok(base);
}

function matchTime(text: string): string | null {
  const m =
    text.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(?:hs|h|horas)\b/) ??
    text.match(/\ba las (\d{1,2})(?:[:.](\d{2}))?\b/) ??
    text.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(?:de|por) la (?:manana|tarde|noche)\b/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  const morning = /\b(de|por|a) la manana\b|\bam\b/.test(text);
  const evening = /\b(de|por|a) la (tarde|noche)\b|\bpm\b/.test(text);
  // Nadie agenda trabajo a las 3 de la madrugada: de 1 a 7 sin aclarar es de la tarde.
  if (h >= 1 && h < 12 && (evening || (h <= 7 && !morning))) h += 12;
  return toHHMM(h * 60 + min);
}

/**
 * Lo que dice cuándo ("hoy", "mañana 10hs", "el lunes", "el 2/12 a las 9:30") sale del
 * título: ya quedó en la fecha y la hora, y si se reprograma el título seguía diciendo "hoy".
 */
const WHEN_PARTS = [
  /\b(?:para |el |este |hoy )?(?:hoy|pasado ma[nñ]ana)\b/giu,
  /(?<!\bla )\b(?:para )?ma[nñ]ana\b/giu,
  /\b(?:para |el |este |pr[oó]ximo )?(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)(?: que viene)?\b/giu,
  /\b(?:para |el )?\d{1,2}\/\d{1,2}\b/gu,
  /\b(?:a las |tipo )?\d{1,2}(?:[:.]\d{2})?\s*(?:hs|h|horas)\b/giu,
  /\ba las \d{1,2}(?:[:.]\d{2})?\b/giu,
  /\b(?:de|por|a) la (?:ma[nñ]ana|tarde|noche)\b/giu,
  /\b(?:am|pm)\b/giu,
];

export function cleanTitle(title: string): string {
  let t = title;
  for (const re of WHEN_PARTS) t = t.replace(re, " ");
  t = t
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s+/g, " ")
    .replace(/^[\s,.;:-]+|[\s,;:-]+$/g, "")
    .trim();
  // Si no queda nada con sentido, mejor la frase original.
  return t.length >= 3 ? t : title;
}

export function parseQuickTask(raw: string, opts: Options): QuickDraft {
  const original = raw.trim().replace(/\s+/g, " ");
  const text = norm(original);
  const title = cleanTitle(original);
  const typeName = TYPE_RULES.find(([re]) => re.test(text))?.[1] ?? null;
  const { date, warning } = matchDate(text, opts.baseDate);
  return {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    clientId: matchClient(text, opts.clients),
    typeName,
    date,
    start: matchTime(text) ?? opts.defaultStart,
    durationMinutes: typeName === "Reunión" || typeName === "Implementación" ? 60 : 30,
    warning,
  };
}
