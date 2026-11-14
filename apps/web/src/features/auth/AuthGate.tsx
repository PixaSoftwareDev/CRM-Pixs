import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { authClient } from "../../lib/auth-client";
import { signOut } from "./api";
import { LoginPage } from "./LoginPage";

const EXPIRED_NOTICE =
  "Tu sesión se cerró (puede que te hayan cambiado los permisos o la contraseña, o que tu usuario esté dado de baja). Volvé a entrar.";

/**
 * Muestra la app si hay sesión; si no, el login. Si la API contesta 401 en uso
 * (sesión vencida o revocada), vuelve al login UNA vez: deja de mostrar la app
 * (así no se disparan más pedidos), limpia la caché y cierra la sesión local.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { data: session, isPending } = authClient.useSession();
  const queryClient = useQueryClient();
  const [expired, setExpired] = useState(false);
  // Varios 401 llegan casi juntos: se atiende el primero.
  const handling = useRef(false);

  useEffect(() => {
    const onExpired = () => {
      if (handling.current) return;
      handling.current = true;
      setExpired(true);
      void queryClient.cancelQueries();
      queryClient.clear();
      // Borra las cookies de la sesión muerta; si falla (sin red), igual queda en el login.
      void signOut().catch(() => undefined);
    };
    window.addEventListener("auth:expired", onExpired);
    return () => window.removeEventListener("auth:expired", onExpired);
  }, [queryClient]);

  // Al cerrar sesión no deben quedar datos del usuario anterior en caché.
  useEffect(() => {
    if (!isPending && !session) queryClient.clear();
  }, [isPending, session, queryClient]);

  if (isPending && !expired) {
    return <div className="flex min-h-dvh items-center justify-center text-sm text-muted">Cargando…</div>;
  }
  if (session && !expired) return children;
  return (
    <LoginPage
      notice={expired ? EXPIRED_NOTICE : null}
      onSignedIn={() => {
        handling.current = false;
        setExpired(false);
      }}
    />
  );
}
