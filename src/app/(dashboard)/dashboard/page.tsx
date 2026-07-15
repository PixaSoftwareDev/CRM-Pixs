import Link from "next/link"
import { FolderIcon, TargetIcon, UsersIcon, WalletIcon } from "@/components/icons"
import { Badge, Card, PageHeader } from "@/components/ui"
import type { OpportunityState } from "@/db/schema"
import { cn, daysUntil, formatDate, formatMoney } from "@/lib/utils"
import {
  coldOpportunities,
  homeCounts,
  pendingReimbursements,
  pipelineSummary,
  receivablesSummary,
  tasksNeedingAttention,
} from "@/modules/dashboard/queries"
import { receivables } from "@/modules/money/queries"
import { STATE_LABELS, STATE_TONES } from "@/modules/opportunities/labels"
import { TASK_COLOR_STYLES } from "@/modules/tasks/colors"

export const dynamic = "force-dynamic"

const OPEN_STATES = (s: string) => !["ganado", "perdido"].includes(s)

export default async function DashboardPage() {
  const [counts, summary, cold, recSummary, recList, tareas, reintegros] = await Promise.all([
    homeCounts(),
    pipelineSummary(),
    coldOpportunities(),
    receivablesSummary(),
    receivables(),
    tasksNeedingAttention(),
    pendingReimbursements(),
  ])

  const valorAbierto = summary
    .filter((s) => OPEN_STATES(s.estado))
    .reduce((acc, s) => acc + Number(s.valor ?? 0), 0)
  const abiertas = summary
    .filter((s) => OPEN_STATES(s.estado))
    .reduce((acc, s) => acc + Number(s.cantidad), 0)

  const maxPipeline = Math.max(1, ...summary.map((s) => Number(s.cantidad)))
  const proximosCobros = recList.slice(0, 6)
  const totalReintegros = reintegros.reduce((a, r) => a + Number(r.total ?? 0), 0)

  return (
    <div className="space-y-6">
      <PageHeader title="Inicio" subtitle="Tu panel de control — qué necesita atención hoy" />

      {/* KPIs — 2 por fila ya en móvil para no apilar 4 tarjetas altas */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Clientes"
          value={String(counts.clientes)}
          icon={<UsersIcon size={18} />}
          href="/contactos"
        />
        <Kpi
          label="Proyectos activos"
          value={String(counts.proyectosActivos)}
          icon={<FolderIcon size={18} />}
          href="/proyectos"
        />
        <Kpi
          label="Valor en oportunidades"
          value={formatMoney(valorAbierto)}
          hint={`${abiertas} oportunidad${abiertas === 1 ? "" : "es"} abierta${abiertas === 1 ? "" : "s"}`}
          icon={<TargetIcon size={18} />}
          href="/pipeline"
        />
        <Kpi
          label="Por cobrar"
          value={formatMoney(Number(recSummary.total ?? 0))}
          hint={`${recSummary.pendientes} cuota${Number(recSummary.pendientes) === 1 ? "" : "s"} pendiente${Number(recSummary.pendientes) === 1 ? "" : "s"}`}
          icon={<WalletIcon size={18} />}
          href="/finanzas"
        />
      </div>

      {/* Tareas por vencer + Reintegros */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Tareas por vencer</h2>
            <Link
              href="/tareas"
              className="text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              Ver todas
            </Link>
          </div>
          {tareas.length === 0 ? (
            <p className="text-sm text-zinc-400">Sin tareas con vencimiento. 👌</p>
          ) : (
            <ul className="divide-y divide-black/[.06] dark:divide-white/[.08]">
              {tareas.map((t) => {
                const dias = daysUntil(t.venceAt as Date)
                const vencida = dias < 0
                return (
                  <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <Link
                      href={`/proyectos/${t.projectId}`}
                      className="flex min-w-0 items-center gap-2"
                    >
                      <span
                        className={cn(
                          "h-2.5 w-2.5 shrink-0 rounded-full",
                          t.color ? TASK_COLOR_STYLES[t.color].bar : "bg-zinc-300 dark:bg-zinc-600",
                        )}
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{t.titulo}</span>
                        <span className="block truncate text-xs text-zinc-400">
                          {t.proyectoNombre}
                        </span>
                      </span>
                    </Link>
                    <Badge tone={vencida ? "red" : dias <= 3 ? "amber" : "neutral"}>
                      {vencida ? `−${Math.abs(dias)}d` : dias === 0 ? "hoy" : `${dias}d`}
                    </Badge>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Reintegros pendientes</h2>
            {totalReintegros > 0 ? (
              <span className="text-xs font-medium text-red-600 dark:text-red-400">
                {formatMoney(totalReintegros)}
              </span>
            ) : null}
          </div>
          {reintegros.length === 0 || totalReintegros === 0 ? (
            <p className="text-sm text-zinc-400">Nada por devolver. 👌</p>
          ) : (
            <ul className="space-y-2.5">
              {reintegros
                .filter((r) => Number(r.total ?? 0) > 0)
                .map((r) => (
                  <li key={r.nombre} className="flex items-center justify-between text-sm">
                    <span className="text-zinc-600 dark:text-zinc-300">{r.nombre}</span>
                    <span className="font-medium">{formatMoney(Number(r.total ?? 0))}</span>
                  </li>
                ))}
              <li className="border-t border-black/[.06] pt-2 dark:border-white/[.08]">
                <Link
                  href="/finanzas"
                  className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                >
                  Gestionar en Finanzas →
                </Link>
              </li>
            </ul>
          )}
        </Card>
      </div>

      {/* Cobrar + Oportunidades + Frías */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <h2 className="mb-3 text-sm font-semibold">Próximos cobros</h2>
          {proximosCobros.length === 0 ? (
            <p className="text-sm text-zinc-400">Nada pendiente. 👌</p>
          ) : (
            <ul className="space-y-2">
              {proximosCobros.map((c) => {
                const dias = daysUntil(c.venceAt)
                const vencida = dias < 0
                return (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/proyectos/${c.projectId}`} className="truncate hover:underline">
                      {c.proyecto}
                    </Link>
                    <div className="flex shrink-0 items-center gap-2">
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

        <Card>
          <h2 className="mb-3 text-sm font-semibold">Oportunidades por estado</h2>
          {summary.length === 0 ? (
            <p className="text-sm text-zinc-400">Sin oportunidades.</p>
          ) : (
            <div className="space-y-2.5">
              {summary.map((s) => (
                <div key={s.estado} className="text-sm">
                  <div className="mb-1 flex items-center justify-between">
                    <Badge tone={STATE_TONES[s.estado as OpportunityState]}>
                      {STATE_LABELS[s.estado as OpportunityState]}
                    </Badge>
                    <span className="text-xs text-zinc-500">
                      {s.cantidad} · {formatMoney(Number(s.valor ?? 0))}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-black/[.05] dark:bg-white/[.08]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500"
                      style={{ width: `${(Number(s.cantidad) / maxPipeline) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold">Oportunidades frías</h2>
          {cold.length === 0 ? (
            <p className="text-sm text-zinc-400">Ninguna. 👌</p>
          ) : (
            <ul className="space-y-2">
              {cold.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/pipeline/${o.id}`} className="min-w-0 truncate hover:underline">
                    {o.titulo}
                    <span className="text-zinc-400"> · {o.contactoNombre}</span>
                  </Link>
                  <span className="shrink-0 text-xs text-zinc-400">
                    {formatDate(o.estadoCambiadoAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

function Kpi({
  label,
  value,
  hint,
  icon,
  href,
}: {
  label: string
  value: string
  hint?: string
  icon: React.ReactNode
  href: string
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-black/[.08] bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md dark:border-white/[.12] dark:bg-zinc-950 dark:hover:border-zinc-600"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">{label}</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-400">
          {icon}
        </span>
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-zinc-400">{hint}</div> : null}
    </Link>
  )
}
