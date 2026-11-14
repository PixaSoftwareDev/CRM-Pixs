/**
 * Carga rápida de Finanzas: "pagué 25000 de hosting" o "cobré 150.000 de La
 * Espiga" → sentido, importe, cliente y concepto. Siempre se confirma después.
 */
import { parseDecimal } from "../../lib/format";

export interface MovementDraft {
  direction: "ingreso" | "egreso";
  /** Centavos; 0 si no se encontró un importe. */
  amount: number;
  clientId: string | null;
  concept: string;
}

const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const GENERIC = new Set(["panaderia", "estudio", "gimnasio", "clinica", "colegio", "asoc", "del", "las", "los"]);

/** Palabras enteras (la tilde importa: "pagó" no es "pagué"); \b no sirve con letras acentuadas. */
const words = (alts: string) => new RegExp(`(?<![\\p{L}\\d])(?:${alts})(?![\\p{L}\\d])`, "u");
/** "me pagó", "nos transfirieron", "cobré": entra plata. Va antes que los gastos porque "pagó" contiene "pago". */
const INCOME = words("(?:me|nos)\\s+(?:pag[oó]|pagaron|transfiri[oó]|transfirieron|deposit[oó]|depositaron|abon[oó]|abonaron)|cobr[eé]|cobramos|cobro|ingres[oó]|entr[oó]");
/** "pagué", "gasté", "compramos", "pago de…": sale plata. "pagó"/"abonó" (alguien nos pagó) no cuentan. */
const EXPENSE = words("pagu[eé]|pagamos|pago|gast[eé]|gastamos|gasto|compr[eé]|compramos|compra|abon[eé]|abonamos");

/** Un número con su unidad: "150.000", "1500.50", "12.500,50", "25k", "1,5 m", "3 mil", "$ 4000". */
const AMOUNT = /(\$\s*)?(\d+(?:[.,]\d+)*)(?:\s*(k|mil|millon(?:es)?|m)(?![\p{L}\d]))?/giu;
/** Lo que cuenta cosas y no plata: "2 meses", "3 cuotas", "10 horas". */
const QUANTITY = /^\s*(?:mes(?:es)?|cuotas?|d[ií]as?|a[nñ]os?|semanas?|horas?|hs|unidades?|licencias?|personas?|veces|x)(?![\p{L}\d])/iu;

/**
 * El importe de la frase. Si hay varios números gana el que tiene "$", después
 * el que tiene unidad (k, mil, m) y si no el más grande; se saltean los que
 * cuentan cosas ("pagué 2 meses de hosting por 3000" → 3000).
 */
function parseAmount(text: string): number {
  const candidates: { cents: number; rank: number }[] = [];
  for (const m of text.matchAll(AMOUNT)) {
    const base = m[2] ? parseDecimal(m[2]) : null;
    if (base === null) continue;
    const unit = m[3]?.toLowerCase();
    if (!unit && QUANTITY.test(text.slice((m.index ?? 0) + m[0].length))) continue;
    const factor = unit === "k" || unit === "mil" ? 1_000 : unit?.startsWith("m") ? 1_000_000 : 1;
    candidates.push({ cents: Math.round(base * factor * 100), rank: m[1] ? 2 : unit ? 1 : 0 });
  }
  candidates.sort((a, b) => b.rank - a.rank || b.cents - a.cents);
  return candidates[0]?.cents ?? 0;
}

export function parseMovement(raw: string, clients: readonly { id: string; name: string }[]): MovementDraft {
  const text = norm(raw);
  const lower = raw.toLowerCase();
  const direction = !INCOME.test(lower) && EXPENSE.test(lower) ? "egreso" : "ingreso";
  let clientId: string | null = null;
  let best = 0;
  for (const c of clients) {
    const tokens = norm(c.name).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !GENERIC.has(w));
    const score = tokens.filter((w) => new RegExp(`\\b${w}\\b`).test(text)).length;
    if (score > best) [best, clientId] = [score, c.id];
  }
  // Concepto: lo que viene después de "de/por/en", sin importes ni conectores sueltos al final.
  const after = raw
    .match(/\b(?:de|del|por|en)\s+(.+)$/i)?.[1]
    ?.replace(AMOUNT, "")
    .replace(/(\s+(?:de|del|por|en))+\s*$/i, "")
    .trim();
  const concept = after ? after.charAt(0).toUpperCase() + after.slice(1) : raw.trim();
  return { direction, amount: parseAmount(raw), clientId, concept };
}
