import { redirect } from "next/navigation"
import { Sidebar } from "@/components/Sidebar"
import { getUser } from "@/lib/auth/session"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser()

  // Doble candado: el proxy ya protege, pero acá tenemos el user real.
  if (!user) redirect("/login")

  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <Sidebar email={user.email} />
      <main className="flex-1 animate-fade-in p-4 md:p-8">{children}</main>
    </div>
  )
}
