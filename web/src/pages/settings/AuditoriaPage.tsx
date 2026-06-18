import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Select } from '../../components/ui/Select'
import { Skeleton } from '../../components/ui/Skeleton'
import { ErrorState } from '../../components/ui/ErrorState'
import { EmptyState } from '../../components/ui/EmptyState'
import { adminApi, type AuditLogEntry } from '../../lib/api/admin'

const ENTITY_TYPES = [
  { value: '', label: 'Todas las entidades' },
  { value: 'contact', label: 'Contactos' },
  { value: 'lead', label: 'Leads' },
  { value: 'invoice', label: 'Facturas' },
  { value: 'receipt', label: 'Recibos' },
  { value: 'expense', label: 'Gastos' },
  { value: 'opportunity', label: 'Oportunidades' },
  { value: 'project', label: 'Proyectos' },
  { value: 'task', label: 'Tareas' },
  { value: 'product', label: 'Productos' },
  { value: 'user', label: 'Usuarios' },
]

function ActionBadge({ action }: { action: string }) {
  const colorMap: Record<string, string> = {
    create: 'bg-success/10 text-success border-success/30',
    update: 'bg-info/10 text-info border-info/30',
    delete: 'bg-danger/10 text-danger border-danger/30',
    soft_delete: 'bg-danger/10 text-danger border-danger/30',
    status_change: 'bg-warning/10 text-warning border-warning/30',
    approve: 'bg-success/10 text-success border-success/30',
    reject: 'bg-danger/10 text-danger border-danger/30',
  }
  const cls = colorMap[action] ?? 'bg-surface-raised text-text-secondary border-border'
  return (
    <span className={`text-xs border px-1.5 py-0.5 rounded-md font-medium ${cls}`}>
      {action}
    </span>
  )
}

function DiffViewer({ entry }: { entry: AuditLogEntry }) {
  const [open, setOpen] = useState(false)
  const hasData = entry.before_state || entry.after_state
  if (!hasData) return null
  return (
    <div>
      <button
        onClick={() => setOpen((p) => !p)}
        className="text-xs text-brand hover:underline"
      >
        {open ? 'Ocultar detalle' : 'Ver cambios'}
      </button>
      {open && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {!!entry.before_state && (
            <div>
              <p className="text-xs font-medium text-text-secondary mb-1">Antes</p>
              <pre className="text-xs bg-surface-subtle border border-border rounded-lg p-2 overflow-auto max-h-32 text-text-secondary">
                {String(JSON.stringify(entry.before_state, null, 2))}
              </pre>
            </div>
          )}
          {!!entry.after_state && (
            <div>
              <p className="text-xs font-medium text-text-secondary mb-1">Después</p>
              <pre className="text-xs bg-surface-subtle border border-border rounded-lg p-2 overflow-auto max-h-32 text-text-secondary">
                {String(JSON.stringify(entry.after_state, null, 2))}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function AuditoriaPage() {
  const [entityType, setEntityType] = useState('')

  const { data: logs, isLoading, isError, refetch } = useQuery({
    queryKey: ['audit-logs', { entityType }],
    queryFn: () => adminApi.audit.list({ entity_type: entityType || undefined, limit: 100 }),
  })

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-text">Auditoría</h1>
        <div className="w-52">
          <Select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            options={ENTITY_TYPES}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : isError ? (
        <ErrorState message="No se pudo cargar el registro de auditoría." onRetry={() => refetch()} />
      ) : (logs ?? []).length === 0 ? (
        <EmptyState title="Sin registros" description="No hay eventos de auditoría con los filtros seleccionados." />
      ) : (
        <div className="flex flex-col gap-2">
          {(logs ?? []).map((entry) => (
            <div key={entry.id} className="rounded-xl border border-border bg-surface p-4 flex flex-col gap-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <ActionBadge action={entry.action} />
                  <span className="text-sm font-medium text-text">{entry.entity_type}</span>
                  <span className="text-xs text-text-tertiary font-mono">{entry.entity_id.slice(0, 8)}…</span>
                </div>
                <div className="text-right">
                  <p className="text-xs text-text-tertiary">
                    {entry.timestamp
                      ? new Date(entry.timestamp).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
                      : '—'}
                  </p>
                  {entry.user_id && (
                    <p className="text-xs text-text-tertiary font-mono">{entry.user_id.slice(0, 8)}…</p>
                  )}
                </div>
              </div>
              <DiffViewer entry={entry} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
