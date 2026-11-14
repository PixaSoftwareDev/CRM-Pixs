import { Link } from "@tanstack/react-router";
import {
  Building2,
  CalendarDays,
  FolderKanban,
  KeyRound,
  LifeBuoy,
  LogOut,
  type LucideIcon,
  Sun,
  TrendingUp,
  UserCog,
  Wallet,
  Workflow,
} from "lucide-react";
import { signOut } from "../../features/auth/api";
import type { Area } from "@crm/shared";
import { useAccess } from "../../hooks/useAccess";
import { authClient } from "../../lib/auth-client";

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

export function Sidebar() {
  const { data: session } = authClient.useSession();
  const { isAdmin, can } = useAccess();

  return (
    <aside className="flex flex-col gap-4 bg-ink px-3.5 py-5 text-slate-200 md:sticky md:top-0 md:h-dvh md:w-[248px] md:shrink-0">
      <div className="flex items-center gap-2.5 px-2">
        <span className="flex size-8 items-center justify-center rounded-[9px] bg-brand-soft font-bold text-white">C</span>
        <span className="text-[17px] font-bold tracking-tight text-white">CRM</span>
      </div>

      <nav aria-label="Principal" className="flex gap-0.5 overflow-x-auto md:flex-1 md:flex-col md:overflow-visible">
        {SECTIONS.map((section) => ({
          ...section,
          items: section.items.filter((i) => (!i.adminOnly || isAdmin) && (!i.area || can(i.area, "read"))),
        }))
          .filter((section) => section.items.length > 0)
          .map((section) => (
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
                className="flex items-center gap-3 rounded-[9px] px-2.5 py-2 text-sm whitespace-nowrap text-slate-300 transition hover:bg-slate-800 hover:text-white data-[status=active]:bg-slate-800 data-[status=active]:font-semibold data-[status=active]:text-white data-[status=active]:shadow-[inset_3px_0_0_#818cf8]"
              >
                <Icon size={18} aria-hidden />
                {label}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="hidden items-center gap-2.5 border-t border-slate-800 px-2 pt-4 md:flex">
        <span className="flex size-8 items-center justify-center rounded-full bg-slate-700 text-xs font-bold text-white">
          {session?.user.name.slice(0, 2).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm">{session?.user.name}</span>
        <button
          type="button"
          onClick={() => void signOut()}
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
          className="flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
        >
          <LogOut size={16} aria-hidden />
        </button>
      </div>
    </aside>
  );
}
