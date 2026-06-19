import { useQueries } from '@tanstack/react-query'
import { DollarSign, TrendingUp, Zap, Target, CheckCircle2, Calendar, ArrowRight, AlertTriangle, Clock, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { KPICard } from '../components/ui/KPICard'
import { Skeleton } from '../components/ui/Skeleton'
import { useAuthStore } from '../stores/auth'
import { financeApi, type AlertsSummary } from '../lib/api/finance'
import { leadsApi } from '../lib/api/leads'
import { pipelineApi, type Opportunity } from '../lib/api/sales'
import { tasksApi, type Task } from '../lib/api/tasks'
import { calendarApi, type CalendarEvent } from '../lib/api/calendar'
import { formatMoney, formatDate } from '../lib/utils'

const fmtShort = (n: number) => {
  if (n >= 1_000_000) return `$ ${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$ ${Math.round(n / 1_000)}k`
  return `$ ${Math.round(n).toLocaleString('es-AR')}`
}

function monthRange() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const to = now.toISOString().slice(0, 10)
  return { from, to }
}

const TASK_PRIORITY_COLOR: Record<string, string> = {
  low: 'bg-surface-raised text-text-secondary',
  medium: 'bg-info/10 text-info',
  high: 'bg-warning/10 text-warning',
  urgent: 'bg-danger/10 text-danger',
}

function TaskRow({ task }: { task: Task }) {
  return (
    <Link
      to="/tareas"
      className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-raised transition-colors"
    >
      <div className="flex items-center gap-2 min-w-0">
        <CheckCircle2 size={14} className="shrink-0 text-text-tertiary" />
        <span className="text-sm text-text truncate">{task.title}</span>
      </div>
      <span
        className={`shrink-0 text-xs px-1.5 py-0.5 rounded font-medium ${TASK_PRIORITY_COLOR[task.priority] ?? TASK_PRIORITY_COLOR.medium}`}
      >
        {task.priority}
      </span>
    </Link>
  )
}

function EventRow({ event }: { event: CalendarEvent }) {
  const start = event.starts_at ? new Date(event.starts_at) : null
  const timeLabel = start
    ? start.toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—'
  return (
    <Link
      to="/agenda"
      className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-raised transition-colors"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Calendar size={14} className="shrink-0 text-brand" />
        <span className="text-sm text-text truncate">{event.title}</span>
      </div>
      <span className="shrink-0 text-xs text-text-tertiary whitespace-nowrap">{timeLabel}</span>
    </Link>
  )
}

function SectionCard({
  title,
  linkTo,
  children,
  loading,
}: {
  title: string
  linkTo: string
  children: React.ReactNode
  loading?: boolean
}) {
  return (
    <div className="rounded-xl border border-border bg-surface flex flex-col">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h2 className="text-sm font-semibold text-text">{title}</h2>
        <Link to={linkTo} className="flex items-center gap-1 text-xs text-brand hover:underline">
          Ver todo <ArrowRight size={12} />
        </Link>
      </div>
      <div className="flex flex-col pb-2">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="px-3 py-2">
                <Skeleton className="h-8 w-full" />
              </div>
            ))
          : children}
      </div>
    </div>
  )
}

// Silences unused import warning for Opportunity (used only for type inference via pipelineApi)
void (null as unknown as Opportunity)

function AlertsPanel({ data, loading }: { data?: AlertsSummary; loading?: boolean }) {
  if (loading) return <Skeleton className="h-24 w-full" />

  const overdue = data?.overdue_receivables ?? []
  const obligations = data?.upcoming_obligations ?? []
  const recurring = data?.upcoming_recurring ?? []
  const total = overdue.length + obligations.length + recurring.length
  if (total === 0) return null

  return (
    <div className="space-y-2">
      {overdue.map((inv) => (
        <Link
          key={inv.id}
          to="/finanzas/facturacion"
          className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 p-3 hover:bg-danger/15 transition-colors"
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-danger">
              {inv.contact_name} — Factura {inv.invoice_type} {inv.number ? String(inv.number).padStart(8,'0') : 'S/N'} sin cobrar
            </p>
            <p className="text-xs text-danger/80">
              Resta {formatMoney(inv.remaining, inv.currency)}{inv.due_date ? ` · Vence ${formatDate(inv.due_date)}` : ''}
            </p>
          </div>
        </Link>
      ))}
      {obligations.map((ob) => (
        <Link
          key={ob.id}
          to="/finanzas/calendario"
          className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-3 hover:bg-warning/15 transition-colors"
        >
          <Clock size={16} className="mt-0.5 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-warning">{ob.description}</p>
            <p className="text-xs text-warning/80">
              {formatMoney(ob.amount, ob.currency)}{ob.due_date ? ` · Vence ${formatDate(ob.due_date)}` : ''}
              {ob.source_type === 'recurring' ? ' · Recurrente' : ob.source_type === 'reimbursement' ? ' · Reembolso' : ''}
            </p>
          </div>
        </Link>
      ))}
      {recurring.map((r) => (
        <Link
          key={r.id}
          to="/finanzas/recurrentes"
          className="flex items-start gap-3 rounded-xl border border-info/30 bg-info/10 p-3 hover:bg-info/15 transition-colors"
        >
          <RefreshCw size={16} className="mt-0.5 shrink-0 text-info" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-info">{r.description}</p>
            <p className="text-xs text-info/80">
              {formatMoney(r.amount, r.currency)} · Próximo venc. {r.next_due_date ? formatDate(r.next_due_date) : '—'}
            </p>
          </div>
        </Link>
      ))}
    </div>
  )
}

export function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const can = useAuthStore((s) => s.can)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches'
  const firstName = user?.full_name?.split(' ')[0] ?? ''

  const { from, to } = monthRange()
  const today = new Date().toISOString().slice(0, 10)

  const results = useQueries({
    queries: [
      {
        queryKey: ['dashboard', 'balance'],
        queryFn: () => financeApi.cashFlow.consolidatedBalance(),
        enabled: can('cash_flow', 'view'),
      },
      {
        queryKey: ['dashboard', 'invoices-month', from, to],
        queryFn: () => financeApi.invoices.list({ from, to }),
        enabled: can('invoices', 'view'),
      },
      {
        queryKey: ['dashboard', 'leads-metrics'],
        queryFn: () => leadsApi.leads.metrics(),
        enabled: can('leads', 'view'),
      },
      {
        queryKey: ['dashboard', 'forecast'],
        queryFn: () => pipelineApi.forecast(),
        enabled: can('opportunities', 'view'),
      },
      {
        queryKey: ['dashboard', 'tasks-active'],
        queryFn: () => tasksApi.list({ status: 'in_progress' }),
        enabled: can('tasks', 'view'),
      },
      {
        queryKey: ['dashboard', 'events-upcoming', today],
        queryFn: () => calendarApi.events({ from: today }),
        enabled: can('calendar', 'view'),
      },
      {
        queryKey: ['dashboard', 'alerts'],
        queryFn: () => financeApi.cashFlow.alerts(14),
        enabled: can('cash_flow', 'view'),
      },
    ],
  })

  const [balanceQ, invoicesQ, leadsQ, forecastQ, tasksQ, eventsQ, alertsQ] = results

  const arsBalance = (balanceQ.data ?? []).find((b: { currency: string; balance: string }) => b.currency === 'ARS')?.balance
  const balanceNum = arsBalance ? parseFloat(arsBalance) : null

  const invoicedThisMonth = (invoicesQ.data ?? [])
    .filter((inv) => inv.status !== 'void')
    .reduce((sum, inv) => sum + parseFloat(inv.total_amount ?? '0'), 0)

  const forecastWeighted = forecastQ.data?.forecast
    ? parseFloat(forecastQ.data.forecast)
    : null

  const activeTasks = (tasksQ.data ?? []).filter(
    (t) => t.status === 'in_progress' || t.status === 'todo',
  )
  const upcomingEvents = (eventsQ.data ?? []).slice(0, 5)

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-text">
          {greeting}{firstName ? `, ${firstName}` : ''}
        </h1>
        <p className="mt-1 text-sm capitalize text-text-secondary">
          {new Intl.DateTimeFormat('es-AR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          }).format(new Date())}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {can('cash_flow', 'view') && (
          <KPICard
            label="Saldo consolidado"
            value={balanceNum !== null ? fmtShort(balanceNum) : '—'}
            icon={<DollarSign size={18} />}
            loading={balanceQ.isLoading}
          />
        )}
        {can('invoices', 'view') && (
          <KPICard
            label="Facturado este mes"
            value={invoicesQ.isLoading ? '—' : fmtShort(invoicedThisMonth)}
            icon={<TrendingUp size={18} />}
            loading={invoicesQ.isLoading}
          />
        )}
        {can('leads', 'view') && (
          <KPICard
            label="Leads este mes"
            value={leadsQ.isLoading ? '—' : String(leadsQ.data?.leads_this_month ?? 0)}
            icon={<Zap size={18} />}
            loading={leadsQ.isLoading}
          />
        )}
        {can('opportunities', 'view') && (
          <KPICard
            label="Pipeline ponderado"
            value={
              forecastQ.isLoading ? '—' : forecastWeighted !== null ? fmtShort(forecastWeighted) : '—'
            }
            icon={<Target size={18} />}
            loading={forecastQ.isLoading}
          />
        )}
      </div>

      {can('cash_flow', 'view') && (alertsQ.isLoading || ((alertsQ.data?.overdue_receivables?.length ?? 0) + (alertsQ.data?.upcoming_obligations?.length ?? 0) + (alertsQ.data?.upcoming_recurring?.length ?? 0)) > 0) && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Alertas financieras</h2>
          <AlertsPanel data={alertsQ.data} loading={alertsQ.isLoading} />
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {can('tasks', 'view') && (
          <SectionCard title="Tareas activas" linkTo="/tareas" loading={tasksQ.isLoading}>
            {activeTasks.length === 0 ? (
              <p className="px-4 py-3 text-sm text-text-tertiary">No hay tareas en curso.</p>
            ) : (
              activeTasks.slice(0, 5).map((t) => <TaskRow key={t.id} task={t} />)
            )}
          </SectionCard>
        )}

        {can('calendar', 'view') && (
          <SectionCard title="Próximos eventos" linkTo="/agenda" loading={eventsQ.isLoading}>
            {upcomingEvents.length === 0 ? (
              <p className="px-4 py-3 text-sm text-text-tertiary">No hay eventos próximos.</p>
            ) : (
              upcomingEvents.map((e) => <EventRow key={e.id} event={e} />)
            )}
          </SectionCard>
        )}
      </div>
    </div>
  )
}
