import { useAccess } from "./useAccess";

/** ¿El usuario logueado es administrador? Solo ellos manejan los usuarios y sus permisos. */
export function useIsAdmin(): boolean {
  return useAccess().isAdmin;
}
