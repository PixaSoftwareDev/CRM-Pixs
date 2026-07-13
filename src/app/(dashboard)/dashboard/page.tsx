import Link from "next/link"
import { Badge, Card, PageHeader } from "@/components/ui"
import type { OpportunityState } from "@/db/schema"
import { formatDate, formatMoney } from "@/lib/utils"
import { coldOpportunities, pipelineSummary, receivablesSummary } from "@/modules/dashboard/queries"
import { STATE_LABELS, STATE_TONES } from "@/modules/opportunities/labels"

export const dynamic = "force-dynamic"

export default async function DashboardPage() {
  const [summary, cold, receivables] = await Promise.all([
    pipelineSummary(),
    coldOpportunities(),
    receivablesSummary(),
  ])

  const abiertas = summary
    .filter((s) => !["finalizado", "perdido"].includes(s.estado))
    .reduce((acc, s) => acc + Number(s.cantidad), 0)
  const valorAbierto = summary
    .filter((s) => !["finalizado", "perdido"].includes(s.estado))
    .reduce((acc, s) => acc + Number(s.valor ?? 0), 0)

  return (
    <div>
      <PageHeader title="Inicio" subtitle="Qué necesita atención hoy" />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Oportunidades abiertas" value={String(abiertas)} />
        <Stat label="Valor en pipeline" value={formatMoney(valorAbierto)} />
        <Stat
          label="Cuentas por cobrar"
          value={formatMoney(Number(receivables.total ?? 0))}
          hint={`${receivables.pendientes} cuota(s) pendiente(s)`}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold">Pipeline por estado</h2>
          <div className="space-y-2">
            {summary.length === 0 ? (
              <p className="text-sm text-zinc-400">Sin oportunidades.</p>
            ) : (
              summary.map((s) => (
                <div key={s.estado} className="flex items-center justify-between text-sm">
                  <Badge tone={STATE_TONES[s.estado as OpportunityState]}>
                    {STATE_LABELS[s.estado as OpportunityState]}
                  </Badge>
                  <span className="text-zinc-500">
                    {s.cantidad} · {formatMoney(Number(s.valor ?? 0))}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold">Oportunidades frías (14+ días)</h2>
          {cold.length === 0 ? (
            <p className="text-sm text-zinc-400">Ninguna. 👌</p>
          ) : (
            <ul className="space-y-2">
              {cold.map((o) => (
                <li key={o.id} className="flex items-center justify-between text-sm">
                  <Link href={`/pipeline/${o.id}`} className="hover:underline">
                    {o.titulo}
                    <span className="text-zinc-400"> · {o.contactoNombre}</span>
                  </Link>
                  <span className="text-xs text-zinc-400">{formatDate(o.estadoCambiadoAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <div className="text-xs text-zinc-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {hint ? <div className="mt-1 text-xs text-zinc-400">{hint}</div> : null}
    </Card>
  )
}
