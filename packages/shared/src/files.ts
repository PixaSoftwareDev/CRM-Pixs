import { z } from "zod";

/**
 * Archivos ("contenedor de archivos") de un cliente, un proyecto o un ticket.
 * Se sube de a un archivo por pedido: el nginx de adelante corta en 25 MB el
 * pedido entero, así que el tope por archivo queda un poco por debajo.
 */
export const FILE_MAX_BYTES = 24 * 1024 * 1024;
export const FILE_MAX_LABEL = "24 MB";

export const FILE_OWNERS = ["client", "project", "ticket"] as const;
export type FileOwnerKind = (typeof FILE_OWNERS)[number];

/** De quién son los archivos: exactamente uno de los tres. */
export const fileOwnerQuery = z
  .object({
    clientId: z.uuid().optional(),
    projectId: z.uuid().optional(),
    ticketId: z.uuid().optional(),
  })
  .refine((q) => [q.clientId, q.projectId, q.ticketId].filter(Boolean).length === 1, {
    message: "Indicá un cliente, un proyecto o un ticket",
  });
export type FileOwnerQuery = z.infer<typeof fileOwnerQuery>;

export const fileDownloadQuery = z.object({ download: z.enum(["0", "1"]).optional() });

/** Nombre que se muestra: sin carpetas ni caracteres de control, y no infinito. */
export function cleanFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  // biome-ignore lint/suspicious/noControlCharactersInRegex: se sacan justamente los de control
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!clean) return "archivo";
  if (clean.length <= 180) return clean;
  const dot = clean.lastIndexOf(".");
  const ext = dot > 0 && clean.length - dot <= 12 ? clean.slice(dot) : "";
  return clean.slice(0, 180 - ext.length) + ext;
}
