import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { KPICard } from '../../components/ui/KPICard'
import { Skeleton } from '../../components/ui/Skeleton'
import { leadsApi } from '../../lib/api/leads'

export function MetricsSection() {
  const { data, isLoading } = useQuery({
    queryKey: ['lead-metrics'],
    queryFn: leadsApi.leads.metrics,
  })

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    )
  }
  if (!data) return null

  const chartData = (data.conversion_by_user ?? []).map((u) => ({
    name: u.user_id.slice(0, 8),
    Total: Number(u.total),
    Convertidos: Number(u.converted),
  }))

  return (
    <div className="space-y-4 pt-4 border-t border-border">
      <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">Métricas del mes</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KPICard label="Leads este mes" value={String(data.leads_this_month)} />
        <KPICard label="Total activos" value={String(data.active_leads)} />
        <KPICard label="Convertidos" value={String(data.total_converted)} />
        <KPICard
          label="Tasa de conversión"
          value={`${(data.conversion_rate * 100).toFixed(1)}%`}
        />
      </div>
      {chartData.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-text-secondary mb-3">Conversión por vendedor</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px' }}
              />
              <Bar dataKey="Total" fill="var(--color-info, #3b82f6)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Convertidos" fill="var(--color-success, #10b981)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
