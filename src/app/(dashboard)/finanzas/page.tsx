import { PageHeader } from "@/components/ui"
import { requireUser } from "@/lib/auth"
import { listTransactions, receivables } from "@/modules/money/queries"
import { listProjects } from "@/modules/projects/queries"
import { listUsers } from "@/modules/users/queries"
import { FinanzasClient } from "./FinanzasClient"
import { QuickAdd } from "./QuickAdd"

export const dynamic = "force-dynamic"

const MES = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" })

export default async function FinanzasPage() {
  const [user, txs, cobrar, usuarios, proyectos] = await Promise.all([
    requireUser(),
    listTransactions(),
    receivables(),
    listUsers(),
    listProjects(),
  ])
  const mes = MES.format(new Date())

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finanzas"
        subtitle={`${mes.charAt(0).toUpperCase()}${mes.slice(1)} · qué entró, qué salió y qué falta`}
      />
      <QuickAdd
        usuarios={usuarios}
        proyectos={proyectos.map((p) => ({ id: p.id, nombre: p.nombre }))}
        defaultPagadoPor={user.id}
      />
      <FinanzasClient initial={txs} usuarios={usuarios} cobrar={cobrar} />
    </div>
  )
}
