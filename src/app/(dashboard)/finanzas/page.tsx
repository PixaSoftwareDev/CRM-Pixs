import Link from "next/link"
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui"
import { daysUntil, formatDate, formatMoney } from "@/lib/utils"
import { financeSummary, listTransactions, receivables } from "@/modules/money/queries"
import { listProjects } from "@/modules/projects/queries"
import { TransactionForm } from "./TransactionForm"

export const dynamic = "force-dynamic"

export default async function FinanzasPage() {
  const [summary, txs, cobrar, proyectos] = await Promise.all([
    financeSummary(),
    listTransactions(),
    receivables(),
    listProjects(),
  ])

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <PageHeader title="Finanzas" subtitle="Ingresos, gastos y cuentas por cobrar" />
        <div className="flex gap-2">
          <a
            href="/api/finanzas/export"
            className="inline-flex h-9 items-center rounded-md border border-zinc-300 px-4 text-sm font-medium hover:bg-black/[.04] dark:border-zinc-700 dark:hover:bg-white/[.06]"
          >
            Export CSV
          </a>
          <TransactionForm proyectos={proyectos.map((p) => ({ id: p.id, nombre: p.nombre }))} />
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Ingresos" value={formatMoney(summary.ingresos)} tone="text-green-600" />
        <Stat label="Gastos" value={formatMoney(summary.gastos)} tone="text-red-600" />
        <Stat
          label="Neto"
          value={formatMoney(summary.neto)}
          tone={summary.neto >= 0 ? "text-green-600" : "text-red-600"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <h2 className="mb-3 text-sm font-semibold">Movimientos</h2>
          {txs.length === 0 ? (
            <EmptyState>Sin movimientos registrados.</EmptyState>
          ) : (
            <div className="divide-y divide-black/[.06] dark:divide-white/[.08]">
              {txs.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div>
                    <div className="font-medium">{t.descripcion || t.categoria || t.tipo}</div>
                    <div className="text-xs text-zinc-400">
                      {formatDate(t.fecha)}
                      {t.categoria ? ` · ${t.categoria}` : ""}
                      {t.autor ? ` · ${t.autor}` : ""}
                    </div>
                  </div>
                  <span
                    className={
                      t.tipo === "ingreso"
                        ? "font-medium text-green-600"
                        : "font-medium text-red-600"
                    }
                  >
                    {t.tipo === "ingreso" ? "+" : "−"}
                    {formatMoney(t.monto, t.moneda)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold">Cuentas por cobrar</h2>
          {cobrar.length === 0 ? (
            <p className="text-sm text-zinc-400">Nada pendiente. 👌</p>
          ) : (
            <ul className="space-y-2">
              {cobrar.map((c) => {
                const dias = daysUntil(c.venceAt)
                const vencida = dias < 0
                return (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/proyectos/${c.projectId}`} className="hover:underline">
                      {c.proyecto}
                    </Link>
                    <div className="flex items-center gap-2">
                      <span>{formatMoney(c.monto)}</span>
                      <Badge tone={vencida ? "red" : "amber"}>
                        {vencida ? `−${Math.abs(dias)}d` : `${dias}d`}
                      </Badge>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <Card>
      <div className="text-xs text-zinc-400">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tracking-tight ${tone}`}>{value}</div>
    </Card>
  )
}
