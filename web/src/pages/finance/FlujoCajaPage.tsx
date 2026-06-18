import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts'
import { Select } from '../../components/ui/Select'
import { KPICard } from '../../components/ui/KPICard'
import { ErrorState } from '../../components/ui/ErrorState'
import { Skeleton } from '../../components/ui/Skeleton'
import { formatMoney } from '../../lib/utils'
import { financeApi, type CashFlowProjection } from '../../lib/api/finance'

const SCENARIO_OPTIONS = [
  { value: 'optimistic', label: 'Optimista (cobro al 100%)' },
  { value: 'realistic', label: 'Realista (cobro al 80%)' },
  { value: 'pessimistic', label: 'Pesimista (cobro al 50%)' },
]

const DAYS_OPTIONS = [
  { value: '30', label: '30 días' },
  { value: '60', label: '60 días' },
  { value: '90', label: '90 días' },
]

function bucketLabel(bucket: string): string {
  switch (bucket) {
    case 'b_0_30': return '0–30 días'
    case 'b_31_60': return '31–60 días'
    case 'b_61_90': return '61–90 días'
    case 'b_90_plus': return '+90 días'
    default: return bucket
  }
}

function buildChartData(proj: CashFlowProjection) {
  const buckets = ['b_0_30', 'b_31_60', 'b_61_90', 'b_90_plus'] as const
  return buckets.map((b) => ({
    name: bucketLabel(b),
    Ingresos: parseFloat(proj.receivables_by_bucket[b]),
    Egresos: -parseFloat(proj.payables_by_bucket[b]),
    Neto: parseFloat(proj.net_flow_by_bucket[b]),
  }))
}

export function FlujoCajaPage() {
  const [scenario, setScenario] = useState('realistic')
  const [days, setDays] = useState('90')
  const [currency, setCurrency] = useState('ARS')

  const { data: balances, isLoading: loadingBalances, isError: errorBalances } = useQuery({
    queryKey: ['consolidated-balance'],
    queryFn: () => financeApi.cashFlow.consolidatedBalance(),
  })

  const { data: projection, isLoading, isError, refetch } = useQuery({
    queryKey: ['cash-flow', { scenario, days, currency }],
    queryFn: () =>
      financeApi.cashFlow.projection({
        scenario,
        days: parseInt(days),
        currency: currency || undefined,
      }),
  })

  const currencyOptions = [
    { value: 'ARS', label: 'ARS' },
    { value: 'USD', label: 'USD' },
    ...(balances?.filter((b) => b.currency !== 'ARS' && b.currency !== 'USD').map((b) => ({
      value: b.currency,
      label: b.currency,
    })) ?? []),
  ]

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-text">Flujo de caja</h1>
        <div className="flex flex-wrap gap-3">
          <div className="w-32">
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)} options={currencyOptions} />
          </div>
          <div className="w-44">
            <Select value={scenario} onChange={(e) => setScenario(e.target.value)} options={SCENARIO_OPTIONS} />
          </div>
          <div className="w-28">
            <Select value={days} onChange={(e) => setDays(e.target.value)} options={DAYS_OPTIONS} />
          </div>
        </div>
      </div>

      {/* Saldos consolidados */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-text-secondary uppercase tracking-wide text-xs">
          Saldos consolidados (cajas + bancos)
        </h2>
        {loadingBalances ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : errorBalances ? (
          <ErrorState message="No pudimos cargar los saldos." />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {(balances ?? []).map((b) => (
              <KPICard
                key={b.currency}
                label={`Saldo ${b.currency}`}
                value={formatMoney(b.balance, b.currency)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Proyección */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-text-secondary uppercase tracking-wide text-xs">
          Proyección por período
        </h2>
        {isLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : isError ? (
          <ErrorState message="No pudimos cargar la proyección." onRetry={() => refetch()} />
        ) : projection ? (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <KPICard
                label="Saldo actual"
                value={formatMoney(projection.current_balance, projection.currency || currency)}
              />
              <KPICard
                label="Ingresos esperados"
                value={formatMoney(projection.receivables_by_bucket.total, projection.currency || currency)}
              />
              <KPICard
                label="Egresos proyectados"
                value={formatMoney(projection.payables_by_bucket.total, projection.currency || currency)}
              />
              <KPICard
                label="Saldo proyectado"
                value={formatMoney(projection.projected_balance, projection.currency || currency)}
              />
            </div>

            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-xs text-text-secondary mb-4 capitalize">
                Escenario: <span className="font-medium text-text">{
                  SCENARIO_OPTIONS.find((s) => s.value === scenario)?.label ?? scenario
                }</span>
              </p>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={buildChartData(projection)} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis
                    tickFormatter={(v) => formatMoney(String(Math.abs(v)), projection.currency || currency)}
                    tick={{ fontSize: 11 }}
                    width={90}
                  />
                  <Tooltip
                    formatter={(v) => formatMoney(String(Math.abs(Number(v))), projection.currency || currency)}
                    contentStyle={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px' }}
                  />
                  <Legend />
                  <ReferenceLine y={0} stroke="var(--color-text-tertiary)" />
                  <Bar dataKey="Ingresos" fill="var(--color-success, #22c55e)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Egresos" fill="var(--color-danger, #ef4444)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Neto" fill="var(--color-brand, #6366f1)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {parseFloat(projection.projected_balance) < 0 && (
              <div className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
                Alerta: el saldo proyectado sería negativo ({formatMoney(projection.projected_balance, projection.currency || currency)}). Revisá tus cobros pendientes.
              </div>
            )}
          </>
        ) : null}
      </section>
    </div>
  )
}
