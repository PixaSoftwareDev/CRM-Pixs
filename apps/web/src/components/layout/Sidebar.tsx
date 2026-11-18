import { Link, useRouterState } from "@tanstack/react-router";
import {
  Building2,
  CalendarDays,
  FolderKanban,
  KeyRound,
  LifeBuoy,
  LogOut,
  type LucideIcon,
  Menu,
  Sun,
  TrendingUp,
  UserCog,
  Wallet,
  Workflow,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { signOut } from "../../features/auth/api";
import type { Area } from "@crm/shared";
import { useAccess } from "../../hooks/useAccess";
import { authClient } from "../../lib/auth-client";
import { cn } from "../ui/cn";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Sector que hay que poder ver para que aparezca. */
  area?: Area;
  /** Solo lo ven los administradores. */
  adminOnly?: boolean;
}

const SECTIONS: { title?: string; items: NavItem[] }[] = [
  {
    items: [
      { area: "tareas", to: "/", label: "Mi día", icon: Sun },
      { area: "tareas", to: "/agenda", label: "Agenda", icon: CalendarDays },
    ],
  },
  {
    title: "Clientes",
    items: [
      { area: "clientes", to: "/clientes", label: "Clientes", icon: Building2 },
      { area: "embudo", to: "/embudo", label: "Embudo", icon: TrendingUp },
      { area: "tickets", to: "/tickets", label: "Tickets", icon: LifeBuoy },
      { area: "proyectos", to: "/proyectos", label: "Proyectos", icon: FolderKanban },
    ],
  },
  {
    title: "Empresa",
    items: [
      { area: "finanzas", to: "/finanzas", label: "Finanzas", icon: Wallet },
      { area: "accesos", to: "/accesos", label: "Accesos", icon: KeyRound },
      { area: "automatizaciones", to: "/automatizaciones", label: "Automatizaciones", icon: Workflow },
      { to: "/usuarios", label: "Usuarios", icon: UserCog, adminOnly: true },
    ],
  },
];

type Can = (area: Area, level: "read") => boolean;

/** Las secciones del menú con lo que el usuario puede abrir (sin las que quedan vacías). */
export function allowedSections(can: Can, isAdmin: boolean) {
  return SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((i) => (!i.adminOnly || isAdmin) && (!i.area || can(i.area, "read"))),
  })).filter((section) => section.items.length > 0);
}

export function Sidebar() {
  const { data: session } = authClient.useSession();
  const { isAdmin, can } = useAccess();
  const name = session?.user.name ?? "";
  const sections = allowedSections(can, isAdmin);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // En el celular el menú es una barra con un botón que lo despliega (sin scroll de costado).
  const [open, setOpen] = useState(false);
  const current = sections
    .flatMap((x) => x.items)
    .find((i) => (i.to === "/" ? pathname === "/" : pathname === i.to || pathname.startsWith(`${i.to}/`)));

  // Al ir a otra pantalla se pliega; Esc también.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <aside className="flex min-w-0 flex-col gap-4 bg-ink px-3.5 py-2.5 text-slate-200 md:sticky md:top-0 md:h-dvh md:w-[248px] md:shrink-0 md:py-5">
      <div className="flex min-h-10 items-center gap-2.5 px-2 max-md:pr-0">
        <span className="flex size-8 items-center justify-center rounded-[9px] bg-brand-soft font-bold text-white">C</span>
        <span className="text-[17px] font-bold tracking-tight text-white">CRM</span>
        {current && (
          <span className="min-w-0 truncate text-sm text-slate-400 md:hidden">
            <span aria-hidden>/ </span>
            {current.label}
          </span>
        )}
        <button
          type="button"
          aria-expanded={open}
          aria-controls="menu-principal"
          onClick={() => setOpen((o) => !o)}
          className="ml-auto flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-slate-200 hover:bg-slate-800 md:hidden"
        >
          {open ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}
          Menú
        </button>
      </div>

      <nav
        id="menu-principal"
        aria-label="Principal"
        className={cn("grid-cols-2 gap-1 pb-1 md:flex md:flex-1 md:flex-col md:gap-0.5 md:overflow-y-auto md:pb-0", open ? "grid" : "hidden")}
      >
        {sections.map((section) => (
          <div key={section.title ?? "inicio"} className="contents md:flex md:flex-col md:gap-0.5">
            {section.title && (
              <span className="mx-2.5 mt-3.5 mb-1 hidden text-[11px] font-semibold tracking-[.08em] text-slate-400 uppercase md:block">
                {section.title}
              </span>
            )}
            {section.items.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact: to === "/" }}
                className="flex min-h-11 min-w-0 items-center gap-3 rounded-[9px] px-2.5 py-2 text-sm whitespace-nowrap md:min-h-0 text-slate-300 transition hover:bg-slate-800 hover:text-white data-[status=active]:bg-slate-800 data-[status=active]:font-semibold data-[status=active]:text-white data-[status=active]:shadow-[inset_3px_0_0_#818cf8]"
              >
                <Icon size={18} aria-hidden />
                {label}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className={cn("items-center gap-2.5 border-t border-slate-800 px-2 pt-3 pb-1 md:flex md:pt-4 md:pb-0", open ? "flex" : "hidden")}>
        <Avatar name={name} />
        <span className="min-w-0 flex-1 truncate text-sm" title={name}>
          {name}
        </span>
        <LogoutButton withLabel={open} />
      </div>
    </aside>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-bold text-white">
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

function LogoutButton({ withLabel = false }: { withLabel?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => void signOut()}
      aria-label="Cerrar sesión"
      title="Cerrar sesión"
      className="flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
    >
      <LogOut size={16} aria-hidden />
      {withLabel && "Salir"}
    </button>
  );
}
