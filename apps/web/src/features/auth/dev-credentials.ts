import type { LoginInput } from "./login-schema";

/**
 * Credenciales del usuario de prueba para el acceso rápido.
 * `import.meta.env.DEV` es `false` literal en el build de producción, así que Vite
 * elimina esta rama y los valores nunca llegan al bundle publicado.
 */
export const devCredentials: LoginInput | null =
  import.meta.env.DEV && import.meta.env.VITE_DEV_LOGIN_EMAIL && import.meta.env.VITE_DEV_LOGIN_PASSWORD
    ? {
        email: import.meta.env.VITE_DEV_LOGIN_EMAIL,
        password: import.meta.env.VITE_DEV_LOGIN_PASSWORD,
      }
    : null;
