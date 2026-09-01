import { redirect } from "next/navigation"
import { ConfirmProvider } from "@/components/ConfirmDialog"
import { Sidebar } from "@/components/Sidebar"
import { getUser } from "@/lib/auth/session"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser()

  // Doble candado: el proxy ya protege, pero acá tenemos el user real.
  if (!user) redirect("/login")

  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <Sidebar email={user.email} />
      {/* min-w-0: sin esto, contenido ancho (kanban, tablas) estira la página
          entera en vez de scrollear dentro de su propio overflow-x-auto. */}
      <main className="min-w-0 flex-1 animate-fade-in p-4 md:p-8">
        <ConfirmProvider>{children}</ConfirmProvider>
      </main>
    </div>
  )
}
