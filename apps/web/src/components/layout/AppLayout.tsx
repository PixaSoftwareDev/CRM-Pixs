import { type Area, AREA_INFO } from "@crm/shared";
import { Navigate, Outlet, useRouterState } from "@tanstack/react-router";
import { Eye, Lock } from "lucide-react";
import { useAccess } from "../../hooks/useAccess";
import { ErrorBox, Skeleton } from "../ui/States";
import { allowedSections, Sidebar } from "./Sidebar";

/** A qué sector pertenece cada pantalla (por el comienzo de su dirección). */
const AREA_BY_PATH: [string, Area][] = [
  ["/agenda", "tareas"],
  ["/clientes", "clientes"],
  ["/embudo", "embudo"],
  ["/tickets", "tickets"],
  ["/proyectos", "proyectos"],
  ["/finanzas", "finanzas"],
  ["/accesos", "accesos"],
  ["/automatizaciones", "automatizaciones"],
];

function areaOf(pathname: string): Area | null {
  if (pathname === "/") return "tareas";
  return AREA_BY_PATH.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1] ?? null;
}

export function AppLayout() {
  // La pantalla que de verdad se está mostrando: al navegar, la anterior sigue en el <Outlet />
  // hasta que carga la nueva, y el permiso tiene que ser el de la que se ve.
  const pathname = useRouterState({ select: (s) => (s.resolvedLocation ?? s.location).pathname });
  const area = areaOf(pathname);
  const access = useAccess();
  const { can, ready } = access;
  const blocked = ready && area !== null && !can(area, "read");
  const readOnly = ready && area !== null && !blocked && !can(area, area === "automatizaciones" ? "manage" : "edit");
  // La home es "Mi día"; sin acceso a tareas se arranca en el primer sector permitido.
  const home = pathname === "/" && blocked ? allowedSections(can, access.isAdmin)[0]?.items[0]?.to : undefined;

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-9 sm:py-7">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-[18px]">
          {!ready ? (
            // Hasta saber los permisos no se muestra la pantalla (no se piden datos que capaz no puede ver).
            access.error ? (
              <ErrorBox error={access.error} onRetry={access.retry} />
            ) : (
              <div aria-busy className="flex flex-col gap-3">
                <Skeleton className="h-8 w-1/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            )
          ) : home ? (
            <Navigate to={home} replace />
          ) : blocked ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <Lock size={22} aria-hidden className="text-slate-400" />
              {pathname === "/" ? (
                <h1 className="text-lg font-bold">Todavía no tenés acceso a ningún sector</h1>
              ) : (
                <h1 className="text-lg font-bold">No tenés acceso a {AREA_INFO[area].label}</h1>
              )}
              <p className="text-sm text-muted">Si lo necesitás, pedile el permiso a un administrador.</p>
            </div>
          ) : (
            <>
              {readOnly && (
                <p role="status" className="flex items-center gap-2 rounded-[10px] bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <Eye size={15} aria-hidden className="shrink-0" />
                  <span>
                    Tenés este sector en <strong>solo lectura</strong>: podés ver todo, pero los cambios no se guardan.
                  </span>
                </p>
              )}
              <Outlet />
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
