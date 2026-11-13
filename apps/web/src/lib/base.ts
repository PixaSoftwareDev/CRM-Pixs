/**
 * Prefijo donde vive la app ("" en desarrollo, "/crmpixs" en el VPS). Sale de
 * `base` de Vite (BASE_PATH al compilar) y lo usan el router, la API y el login.
 */
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
