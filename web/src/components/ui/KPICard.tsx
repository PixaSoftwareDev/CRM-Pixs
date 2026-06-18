import { type ReactNode } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '../../lib/utils'

interface KPICardProps {
  label: string
  value: string
  delta?: number // percentage change
  deltaLabel?: string
  icon?: ReactNode
  loading?: boolean
}

export function KPICard({ label, value, delta, deltaLabel, icon, loading }: KPICardProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5 space-y-3">
        <div className="h-4 w-24 rounded bg-surface-raised animate-pulse" />
        <div className="h-8 w-32 rounded bg-surface-raised animate-pulse" />
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-text-secondary">{label}</p>
        {icon && <span className="text-text-tertiary">{icon}</span>}
      </div>
      <p className="text-2xl font-semibold text-text">{value}</p>
      {delta !== undefined && (
        <div
          className={cn(
            'flex items-center gap-1 text-xs font-medium',
            delta > 0 ? 'text-success' : delta < 0 ? 'text-danger' : 'text-text-secondary',
          )}
        >
          {delta > 0 ? (
            <TrendingUp size={14} />
          ) : delta < 0 ? (
            <TrendingDown size={14} />
          ) : (
            <Minus size={14} />
          )}
          <span>
            {Math.abs(delta)}% {deltaLabel ?? ''}
          </span>
        </div>
      )}
    </div>
  )
}
