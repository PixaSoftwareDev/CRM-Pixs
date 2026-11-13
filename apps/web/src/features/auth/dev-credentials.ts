import type { LoginInput } from "./login-schema";

type Credentials = Pick<LoginInput, "email" | "password">;

/**
 * Credenciales para el botón de acceso rápido del login. Dos fuentes:
 *  - Desarrollo: VITE_DEV_LOGIN_* (Vite elimina esta rama del build de producción).
 *  - Prueba en un server: VITE_DEMO_LOGIN_* al compilar. OJO: quedan dentro del
 *    código publicado y cualquiera con el link puede usarlas. Es solo para probar
 *    con una base sin datos reales; para sacarlo, compilar sin esas variables.
 */
function fromEnv(): { credentials: Credentials; label: string; hint: string } | null {
  const env = import.meta.env;
  if (env.DEV && env.VITE_DEV_LOGIN_EMAIL && env.VITE_DEV_LOGIN_PASSWORD) {
    return {
      credentials: { email: env.VITE_DEV_LOGIN_EMAIL, password: env.VITE_DEV_LOGIN_PASSWORD },
      label: "Acceso rápido (desarrollo)",
      hint: "Completa el usuario de prueba. No aparece en producción.",
    };
  }
  if (env.VITE_DEMO_LOGIN_EMAIL && env.VITE_DEMO_LOGIN_PASSWORD) {
    return {
      credentials: { email: env.VITE_DEMO_LOGIN_EMAIL, password: env.VITE_DEMO_LOGIN_PASSWORD },
      label: "Acceso de prueba",
      hint: "Completa el usuario de prueba. Solo para probar: se quita antes de cargar datos reales.",
    };
  }
  return null;
}

export const quickAccess = fromEnv();
