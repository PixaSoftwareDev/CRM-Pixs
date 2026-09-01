import { PageHeader } from "@/components/ui"
import { requireUser } from "@/lib/auth"
import { asset } from "@/lib/basePath"
import { listTransactions, receivables } from "@/modules/money/queries"
import { listProjects } from "@/modules/projects/queries"
import { listUsers } from "@/modules/users/queries"
import { FinanzasClient } from "./FinanzasClient"
import { QuickAdd } from "./QuickAdd"

export const dynamic = "force-dynamic"

export default async function FinanzasPage() {
  const [user, txs, cobrar, usuarios, proyectos] = await Promise.all([
    requireUser(),
    listTransactions(),
    receivables(),
    listUsers(),
    listProjects(),
  ])

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Finanzas" subtitle="La plata de la empresa" />
        <a
          href={asset("/api/finanzas/export")}
          className="inline-flex h-9 items-center rounded-md border border-zinc-300 px-4 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-zinc-700 dark:hover:bg-white/[.06]"
        >
          Exportar
        </a>
      </div>

      <div className="mb-6">
        <QuickAdd
          usuarios={usuarios}
          proyectos={proyectos.map((p) => ({ id: p.id, nombre: p.nombre }))}
          defaultPagadoPor={user.id}
        />
      </div>

      <FinanzasClient
        initial={txs}
        usuarios={usuarios}
        proyectos={proyectos.map((p) => ({ id: p.id, nombre: p.nombre }))}
        cobrar={cobrar}
      />
    </div>
  )
}
