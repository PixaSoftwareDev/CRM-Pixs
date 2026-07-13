/**
 * Constantes de sesión, sin dependencias de base (seguras de importar desde el
 * proxy/edge, donde no se puede arrastrar better-sqlite3).
 */
export const SESSION_COOKIE = "pixs_session"

// Auth local por cookie: la contraseña es compartida y configurable por env.
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "demo1234"
export const DEMO_EMAIL = process.env.DEMO_EMAIL ?? "admin@pixs.com"
