/**
 * Subpath bajo el que se sirve la app (ej. "/crmpixs"). Next `basePath` ya
 * prefija automáticamente `<Link>`, el router, `next/image` y `_next/*`, pero
 * NO los `<img src="/...">` a archivos de /public ni los `fetch`/`window.open`
 * a rutas propias de /api. Para esos casos usá `asset()`.
 *
 * Se define en build con NEXT_PUBLIC_BASE_PATH (inlineado por Next). Vacío en
 * local ⇒ la app corre en la raíz y `asset()` no cambia nada.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? ""

/** Prefija una ruta absoluta interna (assets de /public o rutas de /api). */
export function asset(path: string): string {
  return `${BASE_PATH}${path}`
}
