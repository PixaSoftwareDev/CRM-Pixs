import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { logout } from "@/modules/auth/actions"

const NAV = [
  { href: "/dashboard", label: "Inicio" },
  { href: "/contactos", label: "Contactos" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/proyectos", label: "Proyectos" },
  { href: "/infra", label: "Infra" },
  { href: "/finanzas", label: "Finanzas" },
  { href: "/captacion", label: "Captación" },
]

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Doble candado: el middleware ya protege, pero acá tenemos el user real.
  if (!user) redirect("/login")

  return (
    <div className="flex min-h-full flex-1">
      <aside className="flex w-56 flex-col border-r border-black/[.08] bg-zinc-50 p-4 dark:border-white/[.12] dark:bg-zinc-950">
        <div className="mb-6 px-2 text-lg font-semibold tracking-tight">Pixs CRM</div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-black/[.04] dark:text-zinc-300 dark:hover:bg-white/[.06]"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="mt-auto space-y-2 border-t border-black/[.08] pt-3 dark:border-white/[.12]">
          <div className="truncate px-3 text-xs text-zinc-500">{user.email}</div>
          <form action={logout}>
            <button
              type="submit"
              className="w-full rounded-md px-3 py-2 text-left text-sm text-zinc-700 transition-colors hover:bg-black/[.04] dark:text-zinc-300 dark:hover:bg-white/[.06]"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  )
}
