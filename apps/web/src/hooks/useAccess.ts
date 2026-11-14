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
 * cookie). Mientras cargan no se oculta nada: igual el server es quien autoriza.
 */
export function useAccess() {
  const me = useQuery({ queryKey: ME_KEY, queryFn: () => api.get<Me>("/api/me"), staleTime: 30_000 });
  const permissions = me.data?.permissions;
  return {
    ready: !!me.data,
    isAdmin: me.data?.role === "admin",
    level: (area: Area): Level => permissions?.[area] ?? "manage",
    can: (area: Area, level: Level): boolean => !permissions || hasLevel(permissions[area], level),
  };
}
