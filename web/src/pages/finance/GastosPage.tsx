import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, CheckCircle, XCircle } from 'lucide-react'
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
import { financeApi, type Expense, type CreateExpenseInput } from '../../lib/api/finance'

const statusColor: Record<string, 'neutral' | 'warning' | 'success' | 'danger'> = {
  pending_approval: 'warning',
  approved: 'success',
  rejected: 'danger',
}
const statusLabel: Record<string, string> = {
  pending_approval: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
}
const reimbursementLabel: Record<string, string> = {
  not_applicable: 'N/A',
  pending: 'Pendiente reembolso',
  reimbursed: 'Reembolsado',
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function GastosPage() {
  const can = useAuthStore((s) => s.can)
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [approveTarget, setApproveTarget] = useState<Expense | null>(null)
  const [rejectTarget, setRejectTarget] = useState<Expense | null>(null)

  const qc = useQueryClient()
  const toast = useUIStore((s) => s.toast)

  const { data: expenses, isLoading, isError, refetch } = useQuery({
    queryKey: ['expenses', { status: statusFilter, category: categoryFilter }],
    queryFn: () =>
      financeApi.expenses.list({
        status: statusFilter || undefined,
        category_id: categoryFilter || undefined,
      }),
  })

  const { data: categories } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => financeApi.catalogs.expenseCategories(),
  })

  const approveMut = useMutation({
    mutationFn: (id: string) => financeApi.expenses.approve(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] })
      toast.success('Gasto aprobado')
      setApproveTarget(null)
    },
    onError: () => toast.error('No se pudo aprobar'),
  })

  const rejectMut = useMutation({
    mutationFn: (id: string) => financeApi.expenses.reject(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] })
      toast.success('Gasto rechazado')
      setRejectTarget(null)
    },
    onError: () => toast.error('No se pudo rechazar'),
  })

  const columns: Column<Expense>[] = [
    { key: 'date', header: 'Fecha', render: (e) => formatDate(e.date) },
    { key: 'description', header: 'Descripción', render: (e) => <span className="font-medium text-text">{e.description}</span> },
    {
      key: 'category',
      header: 'Categoría',
      render: (e) => {
        const cat = categories?.find((c) => c.id === e.category_id)
        return <span className="text-text-secondary">{cat?.name ?? '—'}</span>
      },
    },
    {
      key: 'amount',
      header: 'Importe',
      render: (e) => <span className="font-medium">{formatMoney(e.amount, e.currency ?? 'ARS')}</span>,
    },
    {
      key: 'status',
      header: 'Estado',
      render: (e) => (
        <StatusBadge label={statusLabel[e.status] ?? e.status} color={statusColor[e.status] ?? 'neutral'} />
      ),
    },
    {
      key: 'reimbursement',
      header: 'Reembolso',
      render: (e) =>
        e.paid_by_user_id ? (
          <StatusBadge
            label={reimbursementLabel[e.reimbursement_status] ?? e.reimbursement_status}
            color={e.reimbursement_status === 'reimbursed' ? 'success' : e.reimbursement_status === 'pending' ? 'warning' : 'neutral'}
          />
        ) : (
          <span className="text-text-tertiary">—</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      render: (e) => (
        <div className="flex items-center gap-1" onClick={(ev) => ev.stopPropagation()}>
          {e.status === 'pending_approval' && can('finance', 'approve') && (
            <>
              <Button variant="secondary" size="sm" onClick={() => setApproveTarget(e)} title="Aprobar">
                <CheckCircle size={14} />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setRejectTarget(e)} title="Rechazar">
                <XCircle size={14} />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ]

  const categoryOptions = [
    { value: '', label: 'Todas las categorías' },
    ...(categories?.map((c) => ({ value: c.id, label: c.name })) ?? []),
  ]

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-text">Gastos</h1>
        {can('finance', 'create') && (
          <Button variant="primary" size="lg" onClick={() => setFormOpen(true)}>
            <Plus size={20} /> Registrar gasto
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="w-52">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: '', label: 'Todos los estados' },
              { value: 'pending_approval', label: 'Pendiente' },
              { value: 'approved', label: 'Aprobado' },
              { value: 'rejected', label: 'Rechazado' },
            ]}
          />
        </div>
        <div className="w-52">
          <Select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            options={categoryOptions}
          />
        </div>
      </div>

      {isError ? (
        <ErrorState message="No pudimos cargar los gastos." onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={expenses ?? []}
          rowKey={(e) => e.id}
          loading={isLoading}
          emptyState={
            <EmptyState
              title="Sin gastos registrados"
              description="Registrá los gastos de la empresa para controlar el flujo de caja."
              action={
                can('finance', 'create')
                  ? { label: 'Registrar gasto', onClick: () => setFormOpen(true) }
                  : undefined
              }
            />
          }
        />
      )}

      {formOpen && (
        <ExpenseForm
          categories={categories ?? []}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['expenses'] })
            setFormOpen(false)
          }}
        />
      )}

      {approveTarget && (
        <ConfirmModal
          title="Aprobar gasto"
          message={`¿Aprobás el gasto "${approveTarget.description}" por ${formatMoney(approveTarget.amount, approveTarget.currency ?? 'ARS')}?`}
          confirmLabel="Aprobar gasto"
          variant="primary"
          loading={approveMut.isPending}
          onConfirm={() => approveMut.mutate(approveTarget.id)}
          onClose={() => setApproveTarget(null)}
        />
      )}

      {rejectTarget && (
        <ConfirmModal
          title="Rechazar gasto"
          message={`¿Rechazás el gasto "${rejectTarget.description}" por ${formatMoney(rejectTarget.amount, rejectTarget.currency ?? 'ARS')}?`}
          confirmLabel="Rechazar gasto"
          variant="danger"
          loading={rejectMut.isPending}
          onConfirm={() => rejectMut.mutate(rejectTarget.id)}
          onClose={() => setRejectTarget(null)}
        />
      )}
    </div>
  )
}

// ─── Expense form ─────────────────────────────────────────────────────────────

const expenseSchema = z.object({
  date: z.string().min(1, 'Requerido'),
  category_id: z.string().uuid('Seleccioná una categoría'),
  description: z.string().min(1, 'Requerido'),
  amount: z.string().min(1, 'Requerido'),
  currency: z.string().optional(),
  paid_by: z.enum(['company_cash', 'company_bank', 'employee']),
  cash_id: z.string().optional(),
  bank_id: z.string().optional(),
  status: z.string().optional(),
  is_recurring: z.boolean().optional(),
  recurring_frequency: z.string().optional(),
  recurring_due_day: z.string().optional(),
})
type ExpenseFormValues = z.infer<typeof expenseSchema>

function ExpenseForm({
  categories,
  onClose,
  onSaved,
}: {
  categories: { id: string; name: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useUIStore((s) => s.toast)
  const currentUser = useAuthStore((s) => s.user)
  const { data: cashRegisters } = useQuery({
    queryKey: ['cash-registers'],
    queryFn: () => financeApi.cashRegisters.list(),
  })
  const { data: bankAccounts } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => financeApi.bankAccounts.list(),
  })

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      date: new Date().toISOString().slice(0, 10),
      currency: 'ARS',
      paid_by: 'company_cash',
      status: 'approved',
      is_recurring: false,
    },
  })

  const paidBy = watch('paid_by')
  const currency = watch('currency')
  const isRecurring = watch('is_recurring')

  const save = useMutation({
    mutationFn: (data: ExpenseFormValues) => {
      const body: CreateExpenseInput = {
        date: data.date,
        category_id: data.category_id,
        description: data.description,
        amount: data.amount,
        currency: data.currency,
        paid_by_user_id: data.paid_by === 'employee' ? (currentUser?.user_id ?? undefined) : undefined,
        paid_by_cash_id: data.paid_by === 'company_cash' ? data.cash_id || undefined : undefined,
        paid_by_bank_id: data.paid_by === 'company_bank' ? data.bank_id || undefined : undefined,
        status: data.paid_by === 'employee' ? 'pending_approval' : (data.status || 'approved'),
        recurring_frequency: data.is_recurring && data.recurring_frequency ? data.recurring_frequency : undefined,
        recurring_due_day: data.is_recurring && data.recurring_due_day ? parseInt(data.recurring_due_day, 10) : undefined,
      }
      return financeApi.expenses.create(body)
    },
    onSuccess: () => {
      toast.success('Gasto registrado')
      onSaved()
    },
    onError: () => toast.error('No se pudo registrar el gasto'),
  })

  const cashOptions = cashRegisters?.map((c) => ({ value: c.id, label: c.name })) ?? []
  const bankOptions = bankAccounts?.map((b) => ({ value: b.id, label: `${b.bank_name} ${b.alias ?? ''}`.trim() })) ?? []
  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }))

  // Auto-select first available cash/bank when switching paid_by
  useEffect(() => {
    if (paidBy === 'company_cash' && cashOptions.length > 0 && !watch('cash_id')) {
      setValue('cash_id', cashOptions[0].value)
    }
    if (paidBy === 'company_bank' && bankOptions.length > 0 && !watch('bank_id')) {
      setValue('bank_id', bankOptions[0].value)
    }
  }, [paidBy, cashOptions.length, bankOptions.length]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SlideOver open onClose={onClose} title="Registrar gasto">
      <form onSubmit={handleSubmit((d) => save.mutate(d))} className="flex flex-col gap-4">
        <Input
          label="Fecha"
          type="date"
          {...register('date')}
          error={errors.date?.message}
        />
        <Select
          label="Categoría"
          {...register('category_id')}
          error={errors.category_id?.message}
          options={[{ value: '', label: 'Seleccioná una categoría' }, ...categoryOptions]}
        />
        <Input
          label="Descripción"
          {...register('description')}
          error={errors.description?.message}
          placeholder="Descripción del gasto"
        />
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text">Importe</label>
            <MoneyInput
              currency={currency ?? 'ARS'}
              value={watch('amount')}
              onChange={(v) => setValue('amount', v, { shouldValidate: true })}
              error={errors.amount?.message}
            />
          </div>
          <Select
            label="Moneda"
            {...register('currency')}
            options={[{ value: 'ARS', label: 'ARS' }, { value: 'USD', label: 'USD' }]}
          />
        </div>

        <Select
          label="Pagado por"
          {...register('paid_by')}
          options={[
            { value: 'company_cash', label: 'Caja de la empresa' },
            { value: 'company_bank', label: 'Cuenta bancaria' },
            { value: 'employee', label: 'Empleado (requiere reembolso)' },
          ]}
        />

        {paidBy === 'employee' && (
          <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
            Este gasto se marcará como pendiente de aprobación y reembolso.
          </div>
        )}

        {paidBy === 'company_cash' && cashOptions.length === 0 && (
          <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
            No hay cajas creadas. Creá una en Finanzas → Cajas antes de registrar este gasto.
          </div>
        )}
        {paidBy === 'company_cash' && cashOptions.length > 0 && (
          <Select
            label="Caja"
            {...register('cash_id')}
            options={cashOptions}
          />
        )}

        {paidBy === 'company_bank' && bankOptions.length === 0 && (
          <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
            No hay cuentas bancarias cargadas. Agregá una en Finanzas → Bancos.
          </div>
        )}
        {paidBy === 'company_bank' && bankOptions.length > 0 && (
          <Select
            label="Cuenta bancaria"
            {...register('bank_id')}
            options={bankOptions}
          />
        )}

        <div className="rounded-xl border border-border bg-surface-alt p-3 flex flex-col gap-3">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border accent-primary"
              {...register('is_recurring')}
            />
            <span className="text-sm font-medium text-text">¿Se repite todos los meses?</span>
          </label>

          {isRecurring && (
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Frecuencia"
                {...register('recurring_frequency')}
                options={[
                  { value: 'monthly', label: 'Mensual' },
                  { value: 'bimonthly', label: 'Bimestral' },
                  { value: 'quarterly', label: 'Trimestral' },
                  { value: 'annual', label: 'Anual' },
                ]}
              />
              <Input
                label="Día de vencimiento"
                type="number"
                min={1}
                max={31}
                placeholder="Ej: 10"
                {...register('recurring_due_day')}
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>Cancelar</Button>
          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={save.isPending}
            disabled={
              (paidBy === 'company_cash' && cashOptions.length === 0) ||
              (paidBy === 'company_bank' && bankOptions.length === 0)
            }
          >Registrar</Button>
        </div>
      </form>
    </SlideOver>
  )
}
