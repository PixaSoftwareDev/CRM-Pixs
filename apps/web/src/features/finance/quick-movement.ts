/**
 * Carga rápida de Finanzas: "pagué 25000 de hosting" o "cobré 150.000 de La
 * Espiga" → sentido, importe, cliente y concepto. Siempre se confirma después.
 */
export interface MovementDraft {
  direction: "ingreso" | "egreso";
  /** Centavos; 0 si no se encontró un importe. */
  amount: number;
  clientId: string | null;
  concept: string;
}

const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const GENERIC = new Set(["panaderia", "estudio", "gimnasio", "clinica", "colegio", "asoc", "del", "las", "los"]);

/** "150.000", "150000", "25k", "1,5 m", "$ 12.500,50". */
function parseAmount(text: string): number {
  const m = text.match(/\$?\s*(\d[\d.]*(?:,\d{1,2})?)\s*(k|mil|m|millon(?:es)?)?\b/i);
  if (!m?.[1]) return 0;
  const base = Number(m[1].replace(/\./g, "").replace(",", "."));
  const unit = m[2]?.toLowerCase();
  const factor = unit === "k" || unit === "mil" ? 1_000 : unit?.startsWith("m") ? 1_000_000 : 1;
  return Math.round(base * factor * 100);
}

export function parseMovement(raw: string, clients: readonly { id: string; name: string }[]): MovementDraft {
  const text = norm(raw);
  const direction = /\b(pague|pago|gaste|gasto|compre|compra|abone)\b/.test(text) ? "egreso" : "ingreso";
  let clientId: string | null = null;
  let best = 0;
  for (const c of clients) {
    const words = norm(c.name).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !GENERIC.has(w));
    const score = words.filter((w) => new RegExp(`\\b${w}\\b`).test(text)).length;
    if (score > best) [best, clientId] = [score, c.id];
  }
  // Concepto: lo que viene después de "de/por/en", sin el importe.
  const after = raw.match(/\b(?:de|del|por|en)\s+(.+)$/i)?.[1]?.replace(/\$?\s*\d[\d.,]*\s*(k|mil)?/gi, "").trim();
  const concept = after ? after.charAt(0).toUpperCase() + after.slice(1) : raw.trim();
  return { direction, amount: parseAmount(raw), clientId, concept };
}
