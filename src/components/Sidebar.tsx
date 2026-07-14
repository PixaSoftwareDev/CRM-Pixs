"use client"

import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import {
  CheckSquareIcon,
  ChevronLeftIcon,
  CloseIcon,
  FolderIcon,
  HomeIcon,
  KeyIcon,
  LogoutIcon,
  MegaphoneIcon,
  MenuIcon,
  ServerIcon,
  TargetIcon,
  UsersIcon,
  WalletIcon,
} from "@/components/icons"
import { LogoMark, Wordmark } from "@/components/Logo"
import { ThemeToggle } from "@/components/ThemeToggle"
import { cn } from "@/lib/utils"
import { logout } from "@/modules/auth/actions"

const NAV = [
  { href: "/dashboard", label: "Inicio", Icon: HomeIcon },
  { href: "/contactos", label: "Clientes", Icon: UsersIcon },
  { href: "/pipeline", label: "Oportunidades", Icon: TargetIcon },
  { href: "/proyectos", label: "Proyectos", Icon: FolderIcon },
  { href: "/tareas", label: "Tareas", Icon: CheckSquareIcon },
  { href: "/infra", label: "Infra", Icon: ServerIcon },
  { href: "/accesos", label: "Accesos", Icon: KeyIcon },
  { href: "/finanzas", label: "Finanzas", Icon: WalletIcon },
  { href: "/captacion", label: "Captación", Icon: MegaphoneIcon },
]

export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  // Cierra el drawer al navegar.
  // biome-ignore lint/correctness/useExhaustiveDependencies: queremos re-ejecutar al cambiar de ruta
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    setCollapsed(localStorage.getItem("sidebar_collapsed") === "1")
  }, [])

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c
      localStorage.setItem("sidebar_collapsed", next ? "1" : "0")
      return next
    })
  }

  // `compact` = solo íconos (sidebar plegado). El drawer siempre muestra labels.
  const renderNav = (compact: boolean) => (
    <nav className={cn("flex flex-1 flex-col gap-1", compact ? "items-center" : "")}>
      {!compact ? (
        <span className="mb-1 px-3 text-[11px] font-medium uppercase tracking-wider text-zinc-400">
          Menú
        </span>
      ) : null}
      {NAV.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`)
        return (
          <a
            key={href}
            href={href}
            title={compact ? label : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg text-sm transition-colors",
              compact ? "h-10 w-10 justify-center" : "px-3 py-2.5",
              active
                ? "bg-blue-500/10 font-medium text-blue-700 dark:bg-blue-400/15 dark:text-blue-300"
                : "text-zinc-700 hover:bg-black/[.04] dark:text-zinc-300 dark:hover:bg-white/[.06]",
            )}
          >
            <Icon
              className={cn("shrink-0", active ? "opacity-100" : "opacity-70")}
              size={compact ? 20 : 18}
            />
            {compact ? null : <span>{label}</span>}
          </a>
        )
      })}
    </nav>
  )

  const renderFooter = (compact: boolean) => (
    <div className="mt-auto space-y-2 border-t border-black/[.08] pt-4 dark:border-white/[.12]">
      {compact ? (
        <div className="flex justify-center">
          <ThemeToggle />
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 px-3">
          <span className="truncate text-xs text-zinc-500">{email}</span>
          <ThemeToggle className="-mr-1 shrink-0" />
        </div>
      )}
      <form action={logout}>
        <button
          type="submit"
          title={compact ? "Cerrar sesión" : undefined}
          className={cn(
            "flex w-full items-center gap-3 rounded-md py-2 text-sm text-zinc-700 transition-colors hover:bg-black/[.04] dark:text-zinc-300 dark:hover:bg-white/[.06]",
            compact ? "justify-center px-0" : "px-3 text-left",
          )}
        >
          <LogoutIcon className="shrink-0 opacity-70" />
          {compact ? null : "Cerrar sesión"}
        </button>
      </form>
    </div>
  )

  return (
    <>
      {/* Barra superior — solo móvil */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-black/[.08] bg-zinc-50/90 px-4 py-3 backdrop-blur-sm md:hidden dark:border-white/[.12] dark:bg-zinc-950/90">
        <button
          type="button"
          aria-label="Abrir menú"
          onClick={() => setOpen(true)}
          className="-ml-1 flex h-9 w-9 items-center justify-center rounded-md text-zinc-600 hover:bg-black/[.05] dark:text-zinc-300 dark:hover:bg-white/[.08]"
        >
          <MenuIcon />
        </button>
        <Wordmark className="h-5" />
        <ThemeToggle className="ml-auto" />
      </header>

      {/* Sidebar fijo — desde md, plegable */}
      <aside
        className={cn(
          "hidden shrink-0 flex-col border-r border-black/[.08] bg-zinc-50 transition-[width] duration-200 md:flex dark:border-white/[.12] dark:bg-zinc-950",
          collapsed ? "w-[4.5rem] px-3 py-5" : "w-60 px-4 py-6",
        )}
      >
        <div
          className={cn(
            "flex border-b border-black/[.06] dark:border-white/[.08]",
            collapsed
              ? "flex-col items-center gap-3 pb-5"
              : "items-center justify-between gap-2 px-1 pb-5",
          )}
        >
          {collapsed ? <LogoMark className="h-9 w-9" /> : <Wordmark className="h-5" />}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expandir menú" : "Plegar menú"}
            title={collapsed ? "Expandir" : "Plegar"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-black/[.05] dark:hover:bg-white/[.08]"
          >
            <ChevronLeftIcon className={cn("transition-transform", collapsed && "rotate-180")} />
          </button>
        </div>
        <div className="mt-5 flex flex-1 flex-col">{renderNav(collapsed)}</div>
        {renderFooter(collapsed)}
      </aside>

      {/* Drawer — solo móvil (siempre expandido) */}
      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setOpen(false)}
            className="absolute inset-0 animate-fade-in cursor-default bg-black/50 backdrop-blur-sm"
          />
          <aside className="absolute left-0 top-0 flex h-full w-64 animate-slide-up flex-col border-r border-black/[.08] bg-zinc-50 px-4 py-6 dark:border-white/[.12] dark:bg-zinc-950">
            <div className="mb-6 flex items-center justify-between gap-2 border-b border-black/[.06] px-1 pb-5 dark:border-white/[.08]">
              <Wordmark className="h-5" />
              <button
                type="button"
                aria-label="Cerrar menú"
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-black/[.05] dark:hover:bg-white/[.08]"
              >
                <CloseIcon />
              </button>
            </div>
            {renderNav(false)}
            {renderFooter(false)}
          </aside>
        </div>
      ) : null}
    </>
  )
}
