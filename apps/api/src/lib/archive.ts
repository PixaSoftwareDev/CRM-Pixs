/**
 * Baja lógica (proyectos, tickets): se oculta sin borrar, guardando cuándo en
 * `archived_at`. Esto decide si un pedido de edición cambia algo.
 */
export type ArchiveChange = "baja" | "reactivado";

/**
 * Qué cambia al pedir `archived` sobre algo que hoy tiene `archivedAt`.
 * null = nada (no vino el campo, o ya estaba así: no se pisa la fecha original).
 */
export function archivedChange(archivedAt: string | Date | null, archived: boolean | undefined): ArchiveChange | null {
  if (archived === undefined) return null;
  const isArchived = archivedAt !== null;
  if (archived === isArchived) return null;
  return archived ? "baja" : "reactivado";
}
