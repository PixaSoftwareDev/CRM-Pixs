type Cell = string | number | null;

/**
 * Una celda de CSV. Un texto que empieza con = + - @ (o tab / retorno) Excel lo
 * ejecuta como fórmula: se le antepone ' para que quede como texto. Los números
 * propios (importes negativos incluidos) no se tocan.
 */
export function csvCell(v: Cell): string {
  const raw = v === null ? "" : typeof v === "number" ? String(v).replace(".", ",") : v;
  const s = typeof v === "string" && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Filas → texto CSV (separador ";", fin de línea CRLF). */
export const toCsv = (header: string[], rows: Cell[][]) => [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n");

/**
 * Exporta filas a CSV que Excel abre bien en español: separador ";" (Excel en
 * es-AR usa coma decimal), BOM para los acentos y comillas donde haga falta.
 */
export function downloadCsv(filename: string, header: string[], rows: Cell[][]) {
  const body = toCsv(header, rows);
  const url = URL.createObjectURL(new Blob([`﻿${body}`], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}
