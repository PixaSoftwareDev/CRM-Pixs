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

function matchDate(text: string, base: string): string {
  if (/\bpasado manana\b/.test(text)) return addDays(base, 2);
  if (/\bmanana\b/.test(text)) return addDays(base, 1);
  const dm = text.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (dm) {
    const date = `${base.slice(0, 4)}-${dm[2]?.padStart(2, "0")}-${dm[1]?.padStart(2, "0")}`;
    if (!Number.isNaN(Date.parse(date))) return date;
  }
  const wd = WEEKDAYS.findIndex((d) => new RegExp(`\\b${d}\\b`).test(text));
  if (wd >= 0) {
    // El próximo día con ese nombre (si es hoy, el de la semana que viene).
    const diff = (wd - weekday(base) + 7) % 7 || 7;
    return addDays(base, diff);
  }
  return base;
}

function matchTime(text: string): string | null {
  const m = text.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(?:hs|h|horas)\b/) ?? text.match(/\ba las (\d{1,2})(?:[:.](\d{2}))?\b/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  return toHHMM(h * 60 + min);
}

export function parseQuickTask(raw: string, opts: Options): QuickDraft {
  const title = raw.trim().replace(/\s+/g, " ");
  const text = norm(title);
  const typeName = TYPE_RULES.find(([re]) => re.test(text))?.[1] ?? null;
  return {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    clientId: matchClient(text, opts.clients),
    typeName,
    date: matchDate(text, opts.baseDate),
    start: matchTime(text) ?? opts.defaultStart,
    durationMinutes: typeName === "Reunión" || typeName === "Implementación" ? 60 : 30,
  };
}
