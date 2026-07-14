/** Responsables de una tarea guardados como JSON de ids de usuario. */

export function parseAsignados(json: string | null | undefined): string[] {
  if (!json) return []
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : []
  } catch {
    return []
  }
}

export function serializeAsignados(ids: string[] | null | undefined): string | null {
  if (!ids || ids.length === 0) return null
  return JSON.stringify(ids)
}
