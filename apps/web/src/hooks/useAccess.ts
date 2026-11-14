import { type Area, hasLevel, type Level, type Permissions } from "@crm/shared";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

interface Me {
  id: string;
  role: string;
  permissions?: Permissions;
}

export const ME_KEY = ["me"] as const;

/**
 * Rol y permisos del usuario logueado (los vigentes en el server, no los de la
 * cookie). Mientras cargan no se asume ningún permiso (`ready` es false): así
 * no se piden datos de sectores a los que capaz no tiene acceso.
 * Igual el que autoriza es el server; esto solo decide qué mostrar.
 */
export function useAccess() {
  const me = useQuery({ queryKey: ME_KEY, queryFn: () => api.get<Me>("/api/me"), staleTime: 30_000 });
  const permissions = me.data?.permissions;
  return {
    ready: !!me.data,
    error: me.error,
    retry: () => void me.refetch(),
    isAdmin: me.data?.role === "admin",
    level: (area: Area): Level => permissions?.[area] ?? "none",
    can: (area: Area, level: Level): boolean => !!permissions && hasLevel(permissions[area], level),
  };
}
