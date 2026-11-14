import { authClient } from "../lib/auth-client";

/** ¿El usuario logueado es administrador? Las acciones de configuración y de plata son solo para admins. */
export function useIsAdmin(): boolean {
  const user = authClient.useSession().data?.user as { role?: string } | undefined;
  return user?.role === "admin";
}
