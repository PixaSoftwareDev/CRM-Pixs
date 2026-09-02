import Link from "next/link"
import { CheckSquareIcon, FolderIcon, UsersIcon, WalletIcon } from "@/components/icons"
import { Badge, Card, PageHeader } from "@/components/ui"
import { cn, daysUntil, formatMoney } from "@/lib/utils"
import {
  homeCounts,
  pendingReimbursements,
  receivablesSummary,
  tasksNeedingAttention,
} from "@/modules/dashboard/queries"
import { receivables } from "@/modules/money/queries"
import { TASK_COLOR_STYLES } from "@/modules/tasks/colors"

export const dynamic = "force-dynamic"

export default async function DashboardPage() {
  const [counts, recSummary, recList, tareas, reintegros] = await Promise.all([
    homeCounts(),
    receivablesSummary(),
    receivables(),
    tasksNeedingAttention(),
    pendingReimbursements(),
  ])

  const proximosCobros = recList.slice(0, 6)
  const totalReintegros = reintegros.reduce((a, r) => a + Number(r.total ?? 0), 0)
  const vencidas = tareas.filter((t) => t.venceAt && daysUntil(t.venceAt) < 0).length

  return (
    <div className="space-y-6">
      <PageHeader title="Inicio" subtitle="Qué necesita atención hoy" />

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
          label="Tareas pendientes"
          value={String(counts.tareasPendientes)}
          hint={vencidas > 0 ? `${vencidas} vencida${vencidas === 1 ? "" : "s"}` : undefined}
          alerta={vencidas > 0}
          icon={<CheckSquareIcon size={18} />}
          href="/tareas"
        />
        <Kpi
          label="Por cobrar"
          value={formatMoney(Number(recSummary.total ?? 0))}
          hint={`${recSummary.pendientes} cuota${Number(recSummary.pendientes) === 1 ? "" : "s"}`}
          icon={<WalletIcon size={18} />}
          href="/finanzas"
        />
      </div>

      {/* min-w-0 en los items del grid: sin esto las líneas `truncate` de las
          listas fijan el ancho mínimo y la página desborda en pantallas chicas. */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Lo que hay que hacer, primero: ocupa dos tercios */}
        <Card className="min-w-0 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Tareas por vencer</h2>
            <Link
              href="/tareas"
              className="text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              Ver todas →
            </Link>
          </div>
          {tareas.length === 0 ? (
            <p className="text-sm text-zinc-400">Nada por vencer. 👌</p>
          ) : (
            <ul className="divide-y divide-black/[.06] dark:divide-white/[.08]">
              {tareas.map((t) => {
                const dias = t.venceAt ? daysUntil(t.venceAt) : null
                const vencida = dias !== null && dias < 0
                return (
                  <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "h-2.5 w-2.5 shrink-0 rounded-full",
                          t.color ? TASK_COLOR_STYLES[t.color].bar : "bg-zinc-300 dark:bg-zinc-600",
                        )}
                      />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{t.titulo}</div>
                        <div className="truncate text-xs text-zinc-400">{t.proyectoNombre}</div>
                      </div>
                    </div>
                    {dias !== null ? (
                      <Badge tone={vencida ? "red" : dias <= 3 ? "amber" : "neutral"}>
                        {vencida ? `vencida hace ${Math.abs(dias)}d` : `en ${dias}d`}
                      </Badge>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        {/* Plata que falta entrar o devolver */}
        <div className="min-w-0 space-y-6">
          <Card>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Próximos cobros</h2>
              <Link
                href="/finanzas"
                className="text-xs text-blue-600 hover:underline dark:text-blue-400"
              >
                Ver →
              </Link>
            </div>
            {proximosCobros.length === 0 ? (
              <p className="text-sm text-zinc-400">Nada pendiente. 👌</p>
            ) : (
              <ul className="divide-y divide-black/[.06] dark:divide-white/[.08]">
                {proximosCobros.map((c) => {
                  const dias = daysUntil(c.venceAt)
                  const vencida = dias < 0
                  return (
                    <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <Link href={`/proyectos/${c.projectId}`} className="min-w-0 hover:underline">
                        <div className="truncate font-medium">{c.empresa}</div>
                        <div className="truncate text-xs text-zinc-400">{c.proyecto}</div>
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

          {totalReintegros > 0 ? (
            <Card>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">A devolver</h2>
                <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                  {formatMoney(totalReintegros)}
                </span>
              </div>
              <ul className="divide-y divide-black/[.06] dark:divide-white/[.08]">
                {reintegros.map((r) => (
                  <li
                    key={r.nombre}
                    className="flex items-center justify-between gap-2 py-2 text-sm"
                  >
                    <span className="truncate">{r.nombre}</span>
                    <span className="shrink-0 text-zinc-500">
                      {formatMoney(Number(r.total ?? 0))}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
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
  alerta,
}: {
  label: string
  value: string
  hint?: string
  icon: React.ReactNode
  href: string
  /** Pinta la ayuda en ámbar: hay algo que mirar. */
  alerta?: boolean
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
      {hint ? (
        <div
          className={cn(
            "mt-0.5 text-xs",
            alerta ? "text-amber-600 dark:text-amber-400" : "text-zinc-400",
          )}
        >
          {hint}
        </div>
      ) : null}
    </Link>
  )
}
