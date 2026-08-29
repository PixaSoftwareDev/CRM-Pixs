import { PageHeader } from "@/components/ui"
import { requireUser } from "@/lib/auth"
import { asset } from "@/lib/basePath"
import { listTransactions, receivables } from "@/modules/money/queries"
import { listProjects } from "@/modules/projects/queries"
import { listUsers } from "@/modules/users/queries"
import { FinanzasClient } from "./FinanzasClient"
import { TransactionForm } from "./TransactionForm"

export const dynamic = "force-dynamic"

export default async function FinanzasPage() {
  const [user, txs, cobrar, proyectos, usuarios] = await Promise.all([
    requireUser(),
    listTransactions(),
    receivables(),
    listProjects(),
    listUsers(),
  ])

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Finanzas" subtitle="Ingresos, gastos, reintegros y cuentas por cobrar" />
        <div className="flex gap-2">
          <a
            href={asset("/api/finanzas/export")}
            className="inline-flex h-9 items-center rounded-md border border-zinc-300 px-4 text-sm font-medium hover:bg-black/[.04] dark:border-zinc-700 dark:hover:bg-white/[.06]"
          >
            Export CSV
          </a>
          <TransactionForm
            proyectos={proyectos.map((p) => ({ id: p.id, nombre: p.nombre }))}
            usuarios={usuarios}
            defaultPagadoPor={user.id}
          />
        </div>
      </div>

      <FinanzasClient initial={txs} usuarios={usuarios} cobrar={cobrar} />
    </div>
  )
}
