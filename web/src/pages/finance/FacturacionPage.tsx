import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Trash2, FileText, Send, Ban } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
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
import { ContactPicker } from '../../components/ui/ContactPicker'
import { useAuthStore } from '../../stores/auth'
import { useUIStore } from '../../stores/ui'
import { formatMoney, formatDate } from '../../lib/utils'
import {
  financeApi,
  type Invoice,
  type InvoiceReceived,
  type CreateInvoiceInput,
} from '../../lib/api/finance'

const invoiceStatusColor: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> =
  {
    draft: 'neutral',
    issued: 'info',
    partially_paid: 'warning',
    paid: 'success',
    overdue: 'danger',
    void: 'neutral',
  }
const invoiceStatusLabel: Record<string, string> = {
  draft: 'Borrador',
  issued: 'Emitida',
  partially_paid: 'Pago parcial',
  paid: 'Pagada',
  overdue: 'Vencida',
  void: 'Anulada',
}
const receivedStatusColor: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> =
  {
    pending: 'warning',
    partially_paid: 'info',
    paid: 'success',
    void: 'neutral',
  }
const receivedStatusLabel: Record<string, string> = {
  pending: 'Pendiente',
  partially_paid: 'Pago parcial',
  paid: 'Pagada',
  void: 'Anulada',
}

// ─── Item schema ──────────────────────────────────────────────────────────────

const itemSchema = z.object({
  description: z.string().min(1, 'Requerido'),
  quantity: z.string().min(1, 'Requerido'),
  unit_price: z.string().min(1, 'Requerido'),
  discount_pct: z.string().optional(),
  vat_rate_pct: z.string().optional(),
})

const invoiceSchema = z.object({
  invoice_type: z.string().min(1, 'Requerido'),
  contact_id: z.string().uuid('Seleccioná un contacto'),
  issue_date: z.string().min(1, 'Requerido'),
  due_date: z.string().optional(),
  currency: z.string().min(1, 'Requerido'),
  exchange_rate: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1, 'Agregá al menos un ítem'),
})
type InvoiceFormValues = z.infer<typeof invoiceSchema>

// ─── Main page ────────────────────────────────────────────────────────────────

export function FacturacionPage() {
  const can = useAuthStore((s) => s.can)
  const [tab, setTab] = useState<'emitidas' | 'recibidas'>('emitidas')
  const [statusFilter, setStatusFilter] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [receivedFormOpen, setReceivedFormOpen] = useState(false)
  const [issueTarget, setIssueTarget] = useState<Invoice | null>(null)
  const [voidTarget, setVoidTarget] = useState<Invoice | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null)

  const qc = useQueryClient()
  const toast = useUIStore((s) => s.toast)

  const { data: invoices, isLoading, isError, refetch } = useQuery({
    queryKey: ['invoices', { status: statusFilter || undefined }],
    queryFn: () => financeApi.invoices.list({ status: statusFilter || undefined }),
    enabled: tab === 'emitidas',
  })

  const { data: received, isLoading: loadingReceived, isError: errorReceived, refetch: refetchReceived } = useQuery({
    queryKey: ['invoices-received', { status: statusFilter || undefined }],
    queryFn: () => financeApi.invoicesReceived.list({ status: statusFilter || undefined }),
    enabled: tab === 'recibidas',
  })

  const issueMutation = useMutation({
    mutationFn: (inv: Invoice) => financeApi.invoices.issue(inv.id, uuidv4()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Factura emitida')
      setIssueTarget(null)
    },
    onError: () => toast.error('No se pudo emitir la factura'),
  })

  const voidMutation = useMutation({
    mutationFn: (id: string) => financeApi.invoices.void(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Factura anulada')
      setVoidTarget(null)
    },
    onError: () => toast.error('No se pudo anular la factura'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => financeApi.invoices.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Borrador eliminado')
      setDeleteTarget(null)
    },
    onError: () => toast.error('No se pudo eliminar'),
  })

  const issuedColumns: Column<Invoice>[] = [
    {
      key: 'number',
      header: 'Nro.',
      render: (inv) => (
        <span className="font-mono text-sm">
          {inv.number ? `${inv.invoice_type} ${String(inv.number).padStart(8, '0')}` : '—'}
        </span>
      ),
    },
    { key: 'issue_date', header: 'Fecha', render: (inv) => formatDate(inv.issue_date) },
    { key: 'due_date', header: 'Venc.', render: (inv) => inv.due_date ? formatDate(inv.due_date) : '—' },
    {
      key: 'status',
      header: 'Estado',
      render: (inv) => (
        <StatusBadge
          label={invoiceStatusLabel[inv.status] ?? inv.status}
          color={invoiceStatusColor[inv.status] ?? 'neutral'}
        />
      ),
    },
    {
      key: 'total_amount',
      header: 'Total',
      render: (inv) => (
        <span className="font-medium">{formatMoney(inv.total_amount, inv.currency)}</span>
      ),
    },
    {
      key: 'paid_amount',
      header: 'Cobrado',
      render: (inv) => formatMoney(inv.paid_amount, inv.currency),
    },
    {
      key: 'actions',
      header: '',
      render: (inv) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {inv.status === 'draft' && can('finance', 'edit') && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIssueTarget(inv)}
                title="Emitir"
              >
                <Send size={14} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeleteTarget(inv)}
                title="Eliminar borrador"
              >
                <Trash2 size={14} />
              </Button>
            </>
          )}
          {inv.status === 'issued' && can('finance', 'edit') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setVoidTarget(inv)}
              title="Anular"
            >
              <Ban size={14} />
            </Button>
          )}
        </div>
      ),
    },
  ]

  const receivedColumns: Column<InvoiceReceived>[] = [
    {
      key: 'number',
      header: 'Nro.',
      render: (inv) => (
        <span className="font-mono text-sm">
          {inv.invoice_type && inv.number
            ? `${inv.invoice_type} ${String(inv.number).padStart(8, '0')}`
            : '—'}
        </span>
      ),
    },
    {
      key: 'issue_date',
      header: 'Fecha',
      render: (inv) => (inv.issue_date ? formatDate(inv.issue_date) : '—'),
    },
    {
      key: 'due_date',
      header: 'Venc.',
      render: (inv) => (inv.due_date ? formatDate(inv.due_date) : '—'),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (inv) => (
        <StatusBadge
          label={receivedStatusLabel[inv.status] ?? inv.status}
          color={receivedStatusColor[inv.status] ?? 'neutral'}
        />
      ),
    },
    {
      key: 'total_amount',
      header: 'Total',
      render: (inv) => (
        <span className="font-medium">{formatMoney(inv.total_amount, inv.currency ?? 'ARS')}</span>
      ),
    },
    {
      key: 'paid_amount',
      header: 'Pagado',
      render: (inv) => formatMoney(inv.paid_amount, inv.currency ?? 'ARS'),
    },
  ]

  const statusOptions = [
    { value: '', label: 'Todos los estados' },
    ...(tab === 'emitidas'
      ? [
          { value: 'draft', label: 'Borrador' },
          { value: 'issued', label: 'Emitida' },
          { value: 'partially_paid', label: 'Pago parcial' },
          { value: 'paid', label: 'Pagada' },
          { value: 'overdue', label: 'Vencida' },
          { value: 'void', label: 'Anulada' },
        ]
      : [
          { value: 'pending', label: 'Pendiente' },
          { value: 'partially_paid', label: 'Pago parcial' },
          { value: 'paid', label: 'Pagada' },
        ]),
  ]

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-text">Facturación</h1>
        {can('finance', 'create') && (
          <div className="flex gap-2">
            {tab === 'emitidas' ? (
              <Button variant="primary" size="lg" onClick={() => setFormOpen(true)}>
                <Plus size={20} /> Nueva factura
              </Button>
            ) : (
              <Button variant="primary" size="lg" onClick={() => setReceivedFormOpen(true)}>
                <Plus size={20} /> Cargar factura recibida
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(['emitidas', 'recibidas'] as const).map((t) => (
            <button
              key={t}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                tab === t
                  ? 'bg-brand text-white'
                  : 'bg-surface text-text-secondary hover:text-text'
              }`}
              onClick={() => { setTab(t); setStatusFilter('') }}
            >
              {t === 'emitidas' ? 'Emitidas' : 'Recibidas'}
            </button>
          ))}
        </div>
        <div className="w-44">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={statusOptions}
          />
        </div>
      </div>

      {tab === 'emitidas' ? (
        isError ? (
          <ErrorState message="No pudimos cargar las facturas." onRetry={() => refetch()} />
        ) : (
          <DataTable
            columns={issuedColumns}
            rows={invoices ?? []}
            rowKey={(inv) => inv.id}
            loading={isLoading}
            emptyState={
              <EmptyState
                icon={<FileText size={28} />}
                title="Sin facturas emitidas"
                description="Creá tu primer factura para comenzar a facturar."
                action={
                  can('finance', 'create')
                    ? { label: 'Nueva factura', onClick: () => setFormOpen(true) }
                    : undefined
                }
              />
            }
          />
        )
      ) : errorReceived ? (
        <ErrorState message="No pudimos cargar las facturas recibidas." onRetry={() => refetchReceived()} />
      ) : (
        <DataTable
          columns={receivedColumns}
          rows={received ?? []}
          rowKey={(inv) => inv.id}
          loading={loadingReceived}
          emptyState={
            <EmptyState
              icon={<FileText size={28} />}
              title="Sin facturas recibidas"
              description="Cargá las facturas de proveedores para gestionar los pagos."
              action={
                can('finance', 'create')
                  ? { label: 'Cargar factura', onClick: () => setReceivedFormOpen(true) }
                  : undefined
              }
            />
          }
        />
      )}

      {formOpen && (
        <InvoiceForm
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['invoices'] })
            setFormOpen(false)
          }}
        />
      )}

      {receivedFormOpen && (
        <InvoiceReceivedForm
          onClose={() => setReceivedFormOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['invoices-received'] })
            setReceivedFormOpen(false)
          }}
        />
      )}

      {issueTarget && (
        <ConfirmModal
          title="Emitir factura"
          message={`¿Confirmás la emisión de la factura borrador? Esta acción no se puede deshacer.`}
          confirmLabel="Emitir factura"
          variant="primary"
          loading={issueMutation.isPending}
          onConfirm={() => issueMutation.mutate(issueTarget)}
          onClose={() => setIssueTarget(null)}
        />
      )}

      {voidTarget && (
        <ConfirmModal
          title="Anular factura"
          message={`¿Confirmás la anulación de la factura ${voidTarget.invoice_type} ${voidTarget.number ? String(voidTarget.number).padStart(8, '0') : ''}? Esta acción no se puede deshacer.`}
          confirmLabel="Anular factura"
          variant="danger"
          loading={voidMutation.isPending}
          onConfirm={() => voidMutation.mutate(voidTarget.id)}
          onClose={() => setVoidTarget(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Eliminar borrador"
          message="¿Eliminás este borrador de factura? Esta acción no se puede deshacer."
          confirmLabel="Eliminar borrador"
          variant="danger"
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

// ─── Invoice form ─────────────────────────────────────────────────────────────

function InvoiceForm({
  invoice,
  onClose,
  onSaved,
}: {
  invoice?: Invoice
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useUIStore((s) => s.toast)
  const { data: vatRates } = useQuery({
    queryKey: ['vat-rates'],
    queryFn: () => financeApi.catalogs.vatRates(),
  })
  const { data: currencies } = useQuery({
    queryKey: ['currencies'],
    queryFn: () => financeApi.catalogs.currencies(),
  })

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      invoice_type: invoice?.invoice_type ?? 'B',
      contact_id: invoice?.contact_id ?? '',
      issue_date: invoice?.issue_date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      due_date: invoice?.due_date?.slice(0, 10) ?? '',
      currency: invoice?.currency ?? 'ARS',
      exchange_rate: invoice?.exchange_rate ?? '1',
      notes: invoice?.notes ?? '',
      items: invoice?.items?.map((it) => ({
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unit_price,
        discount_pct: it.discount_pct,
        vat_rate_pct: '',
      })) ?? [{ description: '', quantity: '1', unit_price: '', discount_pct: '0', vat_rate_pct: '21' }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })

  const items = watch('items')
  const currency = watch('currency')

  const subtotal = items.reduce((acc, it) => {
    const qty = parseFloat(it.quantity || '0')
    const price = parseFloat(it.unit_price || '0')
    const disc = parseFloat(it.discount_pct || '0') / 100
    return acc + qty * price * (1 - disc)
  }, 0)

  const tax = items.reduce((acc, it) => {
    const qty = parseFloat(it.quantity || '0')
    const price = parseFloat(it.unit_price || '0')
    const disc = parseFloat(it.discount_pct || '0') / 100
    const vat = parseFloat(it.vat_rate_pct || '0') / 100
    return acc + qty * price * (1 - disc) * vat
  }, 0)

  const save = useMutation({
    mutationFn: (data: InvoiceFormValues) => {
      const body: CreateInvoiceInput = {
        invoice_type: data.invoice_type,
        contact_id: data.contact_id,
        issue_date: data.issue_date,
        due_date: data.due_date || undefined,
        currency: data.currency,
        exchange_rate: data.exchange_rate || '1',
        notes: data.notes || undefined,
        items: data.items.map((it, i) => ({
          description: it.description,
          quantity: it.quantity,
          unit_price: it.unit_price,
          discount_pct: it.discount_pct || '0',
          vat_rate_pct: it.vat_rate_pct || '0',
          order_pos: i,
        })),
      }
      return invoice
        ? financeApi.invoices.update(invoice.id, body)
        : financeApi.invoices.create(body)
    },
    onSuccess: () => {
      toast.success(invoice ? 'Factura actualizada' : 'Borrador guardado')
      onSaved()
    },
    onError: () => toast.error('No se pudo guardar la factura'),
  })

  const currencyOptions = currencies?.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` })) ?? [
    { value: 'ARS', label: 'ARS — Peso argentino' },
    { value: 'USD', label: 'USD — Dólar estadounidense' },
  ]

  const vatOptions = vatRates?.map((v) => ({ value: v.rate_pct, label: v.name })) ?? [
    { value: '21', label: 'IVA 21%' },
    { value: '10.5', label: 'IVA 10,5%' },
    { value: '0', label: 'Exento' },
  ]

  return (
    <SlideOver open onClose={onClose} title={invoice ? 'Editar borrador' : 'Nueva factura'} size="lg">
      <form onSubmit={handleSubmit((d) => save.mutate(d))} className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Tipo"
            {...register('invoice_type')}
            error={errors.invoice_type?.message}
            options={[
              { value: 'A', label: 'Factura A' },
              { value: 'B', label: 'Factura B' },
              { value: 'C', label: 'Factura C' },
              { value: 'M', label: 'Factura M' },
            ]}
          />
          <Select
            label="Moneda"
            {...register('currency')}
            error={errors.currency?.message}
            options={currencyOptions}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text">Cliente</label>
          <ContactPicker
            value={watch('contact_id')}
            onChange={(id) => setValue('contact_id', id, { shouldValidate: true })}
          />
          {errors.contact_id && (
            <p className="text-xs text-danger">{errors.contact_id.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Fecha de emisión"
            type="date"
            {...register('issue_date')}
            error={errors.issue_date?.message}
          />
          <Input
            label="Fecha de vencimiento"
            type="date"
            {...register('due_date')}
          />
        </div>

        {currency !== 'ARS' && (
          <Input
            label="Tipo de cambio"
            type="text"
            inputMode="decimal"
            {...register('exchange_rate')}
            placeholder="1200.00"
          />
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-text">Ítems</label>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                append({ description: '', quantity: '1', unit_price: '', discount_pct: '0', vat_rate_pct: '21' })
              }
            >
              <Plus size={14} /> Agregar ítem
            </Button>
          </div>
          {errors.items?.root && (
            <p className="text-xs text-danger">{errors.items.root.message}</p>
          )}
          <div className="space-y-3">
            {fields.map((field, idx) => (
              <div key={field.id} className="rounded-xl border border-border bg-surface p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <Input
                      label="Descripción"
                      {...register(`items.${idx}.description`)}
                      error={errors.items?.[idx]?.description?.message}
                      placeholder="Servicio o producto"
                    />
                  </div>
                  <button
                    type="button"
                    className="mt-6 text-text-tertiary hover:text-danger"
                    onClick={() => remove(idx)}
                    disabled={fields.length === 1}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <Input
                    label="Cantidad"
                    type="text"
                    inputMode="decimal"
                    {...register(`items.${idx}.quantity`)}
                    error={errors.items?.[idx]?.quantity?.message}
                  />
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-text">Precio unit.</label>
                    <MoneyInput
                      currency={currency}
                      value={watch(`items.${idx}.unit_price`)}
                      onChange={(v) => setValue(`items.${idx}.unit_price`, v)}
                    />
                  </div>
                  <Input
                    label="Desc. %"
                    type="text"
                    inputMode="decimal"
                    {...register(`items.${idx}.discount_pct`)}
                    placeholder="0"
                  />
                  <Select
                    label="IVA"
                    {...register(`items.${idx}.vat_rate_pct`)}
                    options={vatOptions}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 space-y-1 text-sm">
          <div className="flex justify-between text-text-secondary">
            <span>Neto</span>
            <span>{formatMoney(subtotal.toFixed(2), currency)}</span>
          </div>
          <div className="flex justify-between text-text-secondary">
            <span>IVA</span>
            <span>{formatMoney(tax.toFixed(2), currency)}</span>
          </div>
          <div className="flex justify-between font-semibold text-text border-t border-border pt-1 mt-1">
            <span>Total</span>
            <span>{formatMoney((subtotal + tax).toFixed(2), currency)}</span>
          </div>
        </div>

        <Input
          label="Notas"
          {...register('notes')}
          placeholder="Observaciones opcionales"
        />

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" size="md" loading={isSubmitting || save.isPending}>
            Guardar borrador
          </Button>
        </div>
      </form>
    </SlideOver>
  )
}

// ─── Invoice received form ────────────────────────────────────────────────────

const receivedSchema = z.object({
  supplier_id: z.string().uuid('Seleccioná un proveedor'),
  total_amount: z.string().min(1, 'Requerido'),
  net_amount: z.string().optional(),
  tax_amount: z.string().optional(),
  invoice_type: z.string().optional(),
  currency: z.string().optional(),
  exchange_rate: z.string().optional(),
  issue_date: z.string().optional(),
  due_date: z.string().optional(),
  notes: z.string().optional(),
})
type ReceivedFormValues = z.infer<typeof receivedSchema>

function InvoiceReceivedForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useUIStore((s) => s.toast)
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<ReceivedFormValues>({
    resolver: zodResolver(receivedSchema),
    defaultValues: {
      currency: 'ARS',
      exchange_rate: '1',
      issue_date: new Date().toISOString().slice(0, 10),
    },
  })

  const save = useMutation({
    mutationFn: (data: ReceivedFormValues) =>
      financeApi.invoicesReceived.create({
        supplier_id: data.supplier_id,
        total_amount: data.total_amount,
        net_amount: data.net_amount,
        tax_amount: data.tax_amount,
        invoice_type: data.invoice_type,
        currency: data.currency,
        exchange_rate: data.exchange_rate,
        issue_date: data.issue_date,
        due_date: data.due_date,
        notes: data.notes,
      }),
    onSuccess: () => {
      toast.success('Factura recibida cargada')
      onSaved()
    },
    onError: () => toast.error('No se pudo cargar la factura'),
  })

  const currency = watch('currency')

  return (
    <SlideOver open onClose={onClose} title="Cargar factura recibida">
      <form onSubmit={handleSubmit((d) => save.mutate(d))} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text">Proveedor</label>
          <ContactPicker
            value={watch('supplier_id')}
            onChange={(id) => setValue('supplier_id', id, { shouldValidate: true })}
          />
          {errors.supplier_id && (
            <p className="text-xs text-danger">{errors.supplier_id.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Tipo"
            {...register('invoice_type')}
            options={[
              { value: '', label: 'Sin tipo' },
              { value: 'A', label: 'Factura A' },
              { value: 'B', label: 'Factura B' },
              { value: 'C', label: 'Factura C' },
            ]}
          />
          <Select
            label="Moneda"
            {...register('currency')}
            options={[
              { value: 'ARS', label: 'ARS' },
              { value: 'USD', label: 'USD' },
            ]}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Fecha de emisión" type="date" {...register('issue_date')} />
          <Input label="Fecha de vencimiento" type="date" {...register('due_date')} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text">Neto</label>
            <MoneyInput
              currency={currency ?? 'ARS'}
              value={watch('net_amount')}
              onChange={(v) => setValue('net_amount', v)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text">IVA</label>
            <MoneyInput
              currency={currency ?? 'ARS'}
              value={watch('tax_amount')}
              onChange={(v) => setValue('tax_amount', v)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text">Total</label>
            <MoneyInput
              currency={currency ?? 'ARS'}
              value={watch('total_amount')}
              onChange={(v) => setValue('total_amount', v)}
              error={errors.total_amount?.message}
            />
          </div>
        </div>

        <Input label="Notas" {...register('notes')} />

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" size="md" loading={save.isPending}>
            Guardar
          </Button>
        </div>
      </form>
    </SlideOver>
  )
}
