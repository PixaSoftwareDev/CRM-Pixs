import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueries, useQueryClient } from '@tanstack/react-query'
import { FileText, Plus, MoreVertical } from 'lucide-react'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Select'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { useAuthStore } from '../../stores/auth'
import { useUIStore } from '../../stores/ui'
import { formatMoney, formatDate } from '../../lib/utils'
import { quoteStatusColor, quoteStatusLabel } from '../../lib/crm'
import { quotesApi, type Quote } from '../../lib/api/sales'
import { contactsApi } from '../../lib/api/contacts'
import { ContactPicker } from '../../components/ui/ContactPicker'

const statusFilter = [
  { value: '', label: 'Todos los estados' },
  { value: 'draft', label: 'Borrador' },
  { value: 'sent', label: 'Enviado' },
  { value: 'accepted', label: 'Aceptado' },
  { value: 'rejected', label: 'Rechazado' },
  { value: 'cancelled', label: 'Cancelado' },
]

// Allowed status actions given the current status.
const statusActions: Record<string, { status: string; label: string }[]> = {
  draft: [
    { status: 'sent', label: 'Marcar enviado' },
    { status: 'cancelled', label: 'Cancelar' },
  ],
  sent: [
    { status: 'accepted', label: 'Marcar aceptado' },
    { status: 'rejected', label: 'Marcar rechazado' },
    { status: 'cancelled', label: 'Cancelar' },
  ],
  accepted: [],
  rejected: [],
  cancelled: [],
}

export function QuotesPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const can = useAuthStore((s) => s.can)
  const toast = useUIStore((s) => s.toast)
  const [status, setStatus] = useState('')
  const [contactId, setContactId] = useState('')
  const [menuFor, setMenuFor] = useState<string | null>(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['quotes', status, contactId],
    queryFn: () => quotesApi.list({ status: status || undefined, contact_id: contactId || undefined }),
  })

  // Resolve unique contact names.
  const contactIds = [...new Set((data ?? []).map((q) => q.contact_id))]
  const contactQueries = useQueries({
    queries: contactIds.map((cid) => ({
      queryKey: ['contact', cid],
      queryFn: () => contactsApi.get(cid),
      enabled: !!cid,
    })),
  })
  const contactName: Record<string, string> = {}
  contactQueries.forEach((q) => {
    if (q.data) contactName[q.data.id] = q.data.fantasy_name
  })

  const setStatusM = useMutation({
    mutationFn: ({ id, s }: { id: string; s: string }) => quotesApi.setStatus(id, s),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotes'] })
      toast.success('Estado actualizado')
    },
    onError: () => toast.error('No se pudo cambiar el estado'),
  })

  const canEdit = can('quotes', 'edit') || can('quotes', 'update')

  const columns: Column<Quote>[] = [
    {
      key: 'number',
      header: 'N°',
      render: (q) => (
        <span className="font-medium text-text">
          {q.number ?? '—'}
          {q.version ? <span className="text-text-tertiary"> v{q.version}</span> : null}
        </span>
      ),
    },
    { key: 'contact', header: 'Contacto', render: (q) => contactName[q.contact_id] ?? '…' },
    { key: 'date', header: 'Fecha', render: (q) => formatDate(q.date) },
    { key: 'valid', header: 'Válido hasta', render: (q) => (q.valid_until ? formatDate(q.valid_until) : '—') },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      render: (q) => formatMoney(q.total ?? '0', q.currency),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (q) => (
        <StatusBadge label={quoteStatusLabel[q.status] ?? q.status} color={quoteStatusColor[q.status] ?? 'neutral'} />
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (q) => {
        const actions = statusActions[q.status] ?? []
        if (!canEdit || actions.length === 0) return null
        return (
          <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setMenuFor(menuFor === q.id ? null : q.id)}
              className="text-text-tertiary hover:text-text"
              aria-label="Acciones"
            >
              <MoreVertical size={16} />
            </button>
            {menuFor === q.id && (
              <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-border bg-surface-overlay py-1 shadow-overlay">
                {actions.map((a) => (
                  <button
                    key={a.status}
                    type="button"
                    onClick={() => {
                      setMenuFor(null)
                      setStatusM.mutate({ id: q.id, s: a.status })
                    }}
                    className="block w-full px-3 py-1.5 text-left text-sm text-text hover:bg-surface-raised"
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-text">Presupuestos</h1>
        {can('quotes', 'create') && (
          <Button variant="primary" size="lg" onClick={() => navigate('/ventas/presupuestos/nuevo')}>
            <Plus size={20} />
            Nuevo presupuesto
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-52">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={statusFilter}
            aria-label="Filtrar por estado"
          />
        </div>
        <div className="w-56">
          <ContactPicker
            label="Contacto"
            value={contactId}
            onChange={(id) => setContactId(id)}
          />
        </div>
      </div>

      {isError ? (
        <ErrorState message="No pudimos cargar los presupuestos." onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={data ?? []}
          rowKey={(q) => q.id}
          loading={isLoading}
          onRowClick={(q) => navigate(`/ventas/presupuestos/${q.id}/editar`)}
          emptyState={
            <EmptyState
              icon={<FileText size={28} />}
              title="Todavía no hay presupuestos"
              description="Cargá tu primer presupuesto para enviarlo a un cliente."
              action={
                can('quotes', 'create')
                  ? { label: 'Cargar presupuesto', onClick: () => navigate('/ventas/presupuestos/nuevo') }
                  : undefined
              }
            />
          }
        />
      )}
    </div>
  )
}
