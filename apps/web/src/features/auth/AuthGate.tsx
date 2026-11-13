import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect } from "react";
import { authClient } from "../../lib/auth-client";
import { LoginPage } from "./LoginPage";

/** Muestra la app si hay sesión; si no, el login. Si la sesión vence en uso, vuelve al login. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { data: session, isPending, refetch } = authClient.useSession();
  const queryClient = useQueryClient();

  useEffect(() => {
    const onExpired = () => {
      queryClient.clear();
      void refetch();
    };
    window.addEventListener("auth:expired", onExpired);
    return () => window.removeEventListener("auth:expired", onExpired);
  }, [queryClient, refetch]);

  // Al cerrar sesión no deben quedar datos del usuario anterior en caché.
  useEffect(() => {
    if (!isPending && !session) queryClient.clear();
  }, [isPending, session, queryClient]);

  if (isPending) {
    return <div className="flex min-h-dvh items-center justify-center text-sm text-muted">Cargando…</div>;
  }
  return session ? children : <LoginPage />;
}
