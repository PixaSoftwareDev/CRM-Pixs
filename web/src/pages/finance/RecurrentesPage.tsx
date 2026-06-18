import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, CheckCircle } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { MoneyInput } from '../../components/ui/MoneyInput'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { SlideOver } from '../../components/ui/SlideOver'
import { ConfirmModal } from '../../components/ui/Modal'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { useAuthStore } from '../../stores/auth'
import { useUIStore } from '../../stores/ui'
import { formatMoney, formatDate } from '../../lib/utils'
import {
  financeApi,
  type RecurringPayment,
  type PaymentObligation,
  type RecurringInput,
} from '../../lib/api/finance'

const frequencyLabel: Record<string, string> = {
  monthly: 'Mensual',
  bimonthly: 'Bimestral',
  quarterly: 'Trimestral',
  annual: 'Anual',
}

const obligationStatusColor: Record<string, 'neutral' | 'warning' | 'success' | 'danger'> = {
  pending: 'warning',
  paid: 'success',
  overdue: 'danger',
}
const obligationStatusLabel: Record<string, string> = {
  pending: 'Pendiente',
  paid: 'Pagado',
  overdue: 'Vencido',
}

export function RecurrentesPage() {
  const can = useAuthStore((s) => s.can)
  const [tab, setTab] = useState<'recurrentes' | 'calendario'>('recurrentes')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<RecurringPayment | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<RecurringPayment | null>(null)
  const [payTarget, setPayTarget] = useState<PaymentObligation | null>(null)

  const qc = useQueryClient()
  const toast = useUIStore((s) => s.toast)

  const { data: recurrents, isLoading, isError, refetch } = useQuery({
    queryKey: ['recurring-payments'],
    queryFn: () => financeApi.recurringPayments.list(),
    enabled: tab === 'recurrentes',
  })

  const today = new Date()
  const in90 = new Date(today)
  in90.setDate(in90.getDate() + 90)

  const { data: obligations, isLoading: loadingObs, isError: errorObs, refetch: refetchObs } = useQuery({
    queryKey: ['payment-calendar', { from: today.toISOString().slice(0, 10), to: in90.toISOString().slice(0, 10) }],
    queryFn: () =>
      financeApi.paymentCalendar.list({
        from: today.toISOString().slice(0, 10),
        to: in90.toISOString().slice(0, 10),
      }),
    enabled: tab === 'calendario',
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => financeApi.recurringPayments.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring-payments'] })
      toast.success('Servicio eliminado')
      setDeleteTarget(null)
    },
    onError: () => toast.error('No se pudo eliminar'),
  })

  const markPaidMut = useMutation({
    mutationFn: (ob: PaymentObligation) => financeApi.paymentCalendar.markPaid(ob.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-calendar'] })
      toast.success('Marcado como pagado')
      setPayTarget(null)
    },
    onError: () => toast.error('No se pudo marcar como pagado'),
  })

  const recurringColumns: Column<RecurringPayment>[] = [
    {
      key: 'description',
      header: 'Servicio / Gasto',
      render: (r) => <span className="font-medium text-text">{r.description}</span>,
    },
    {
      key: 'frequency',
      header: 'Frecuencia',
      render: (r) => <StatusBadge label={frequencyLabel[r.frequency] ?? r.frequency} color="neutral" />,
    },
    {
      key: 'amount',
      header: 'Importe estimado',
      render: (r) =>
        r.amount ? formatMoney(r.amount, r.currency ?? 'ARS') : <span className="text-text-tertiary">Variable</span>,
    },
    {
      key: 'next_due_date',
      header: 'Próximo venc.',
      render: (r) =>
        r.next_due_date ? (
          <span className={isOverdue(r.next_due_date) ? 'text-danger font-medium' : ''}>
            {formatDate(r.next_due_date)}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (r) => (
        <StatusBadge label={r.status === 'active' ? 'Activo' : 'Inactivo'} color={r.status === 'active' ? 'success' : 'neutral'} />
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {can('finance', 'edit') && (
            <>
              <Button variant="ghost" size="sm" onClick={() => { setEditing(r); setFormOpen(true) }}>
                <Pencil size={14} />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(r)}>
                <Trash2 size={14} />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ]

  const obligationColumns: Column<PaymentObligation>[] = [
    {
      key: 'due_date',
      header: 'Vencimiento',
      render: (ob) => (
        <span className={getObligationDateClass(ob)}>
          {formatDate(ob.due_date)}
        </span>
      ),
    },
    {
      key: 'description',
      header: 'Descripción',
      render: (ob) => <span className="font-medium text-text">{ob.description}</span>,
    },
    {
      key: 'source_type',
      header: 'Origen',
      render: (ob) => <StatusBadge label={ob.source_type} color="neutral" />,
    },
    {
      key: 'amount',
      header: 'Importe',
      render: (ob) => <span className="font-medium">{formatMoney(ob.amount, ob.currency ?? 'ARS')}</span>,
    },
    {
      key: 'status',
      header: 'Estado',
      render: (ob) => (
        <StatusBadge
          label={obligationStatusLabel[ob.status] ?? ob.status}
          color={obligationStatusColor[ob.status] ?? 'neutral'}
        />
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (ob) => (
        <div onClick={(e) => e.stopPropagation()}>
          {ob.status !== 'paid' && can('finance', 'edit') && (
            <Button variant="secondary" size="sm" onClick={() => setPayTarget(ob)}>
              <CheckCircle size={14} /> Marcar pagado
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-text">Pagos recurrentes</h1>
        {tab === 'recurrentes' && can('finance', 'create') && (
          <Button variant="primary" size="lg" onClick={() => { setEditing(null); setFormOpen(true) }}>
            <Plus size={20} /> Nuevo servicio
          </Button>
        )}
      </div>

      <div className="flex rounded-lg border border-border overflow-hidden w-fit">
        {(['recurrentes', 'calendario'] as const).map((t) => (
          <button
            key={t}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === t ? 'bg-brand text-white' : 'bg-surface text-text-secondary hover:text-text'
            }`}
            onClick={() => setTab(t)}
          >
            {t === 'recurrentes' ? 'Servicios recurrentes' : 'Calendario de pagos (90 días)'}
          </button>
        ))}
      </div>

      {tab === 'recurrentes' ? (
        isError ? (
          <ErrorState message="No pudimos cargar los servicios recurrentes." onRetry={() => refetch()} />
        ) : (
          <DataTable
            columns={recurringColumns}
            rows={recurrents ?? []}
            rowKey={(r) => r.id}
            loading={isLoading}
            emptyState={
              <EmptyState
                title="Sin pagos recurrentes"
                description="Cargá tus servicios recurrentes para visualizarlos en el calendario de pagos."
                action={
                  can('finance', 'create')
                    ? { label: 'Nuevo servicio', onClick: () => { setEditing(null); setFormOpen(true) } }
                    : undefined
                }
              />
            }
          />
        )
      ) : errorObs ? (
        <ErrorState message="No pudimos cargar el calendario." onRetry={() => refetchObs()} />
      ) : (
        <DataTable
          columns={obligationColumns}
          rows={obligations ?? []}
          rowKey={(ob) => ob.id}
          loading={loadingObs}
          emptyState={
            <EmptyState
              title="Sin pagos programados"
              description="No hay pagos programados para los próximos 90 días."
            />
          }
        />
      )}

      {formOpen && (
        <RecurringForm
          recurring={editing}
          onClose={() => { setFormOpen(false); setEditing(null) }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['recurring-payments'] })
            setFormOpen(false)
            setEditing(null)
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Eliminar servicio recurrente"
          message={`¿Eliminás "${deleteTarget.description}"? Se eliminarán también las obligaciones futuras pendientes.`}
          confirmLabel="Eliminar servicio"
          variant="danger"
          loading={deleteMut.isPending}
          onConfirm={() => deleteMut.mutate(deleteTarget.id)}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {payTarget && (
        <ConfirmModal
          title="Marcar como pagado"
          message={`¿Confirmás el pago de "${payTarget.description}" por ${formatMoney(payTarget.amount, payTarget.currency ?? 'ARS')} con vencimiento ${formatDate(payTarget.due_date)}?`}
          confirmLabel="Marcar como pagado"
          variant="primary"
          loading={markPaidMut.isPending}
          onConfirm={() => markPaidMut.mutate(payTarget)}
          onClose={() => setPayTarget(null)}
        />
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isOverdue(dateStr: string): boolean {
  return new Date(dateStr) < new Date()
}

function getObligationDateClass(ob: PaymentObligation): string {
  if (ob.status === 'paid') return 'text-text-secondary'
  const due = new Date(ob.due_date)
  const now = new Date()
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 'text-danger font-medium'
  if (diffDays <= 7) return 'text-warning font-medium'
  return 'text-text'
}

// ─── Form ─────────────────────────────────────────────────────────────────────

function RecurringForm({
  recurring,
  onClose,
  onSaved,
}: {
  recurring: RecurringPayment | null
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useUIStore((s) => s.toast)
  const [description, setDescription] = useState(recurring?.description ?? '')
  const [frequency, setFrequency] = useState(recurring?.frequency ?? 'monthly')
  const [amount, setAmount] = useState(recurring?.amount ?? '')
  const [currency, setCurrency] = useState(recurring?.currency ?? 'ARS')
  const [nextDueDate, setNextDueDate] = useState(recurring?.next_due_date?.slice(0, 10) ?? '')
  const [status, setStatus] = useState(recurring?.status ?? 'active')

  const { data: categories } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => financeApi.catalogs.expenseCategories(),
  })
  const [categoryId, setCategoryId] = useState(recurring?.category_id ?? '')

  const save = useMutation({
    mutationFn: () => {
      const body: RecurringInput = {
        description,
        frequency,
        amount: amount || undefined,
        currency: currency || undefined,
        next_due_date: nextDueDate || undefined,
        category_id: categoryId || undefined,
        status,
      }
      return recurring
        ? financeApi.recurringPayments.update(recurring.id, body)
        : financeApi.recurringPayments.create(body)
    },
    onSuccess: () => {
      toast.success(recurring ? 'Servicio actualizado' : 'Servicio creado')
      onSaved()
    },
    onError: () => toast.error('No se pudo guardar'),
  })

  const categoryOptions = categories?.map((c) => ({ value: c.id, label: c.name })) ?? []

  return (
    <SlideOver open onClose={onClose} title={recurring ? 'Editar servicio recurrente' : 'Nuevo servicio recurrente'}>
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (description && frequency) save.mutate() }}>
        <Input label="Descripción / Servicio" value={description} onChange={(e) => setDescription(e.target.value)} required />
        <Select
          label="Frecuencia"
          value={frequency}
          onChange={(e) => setFrequency(e.target.value)}
          options={[
            { value: 'monthly', label: 'Mensual' },
            { value: 'bimonthly', label: 'Bimestral' },
            { value: 'quarterly', label: 'Trimestral' },
            { value: 'annual', label: 'Anual' },
          ]}
        />
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text">Importe (opcional)</label>
            <MoneyInput currency={currency} value={amount} onChange={setAmount} />
          </div>
          <Select
            label="Moneda"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            options={[{ value: 'ARS', label: 'ARS' }, { value: 'USD', label: 'USD' }]}
          />
        </div>
        <Input label="Próximo vencimiento" type="date" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} />
        {categoryOptions.length > 0 && (
          <Select
            label="Categoría"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            options={[{ value: '', label: 'Sin categoría' }, ...categoryOptions]}
          />
        )}
        <Select
          label="Estado"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[{ value: 'active', label: 'Activo' }, { value: 'inactive', label: 'Inactivo' }]}
        />
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" size="md" loading={save.isPending}>Guardar</Button>
        </div>
      </form>
    </SlideOver>
  )
}
