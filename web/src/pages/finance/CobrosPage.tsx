import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Trash2, FileText } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { MoneyInput } from '../../components/ui/MoneyInput'
import { DataTable, type Column } from '../../components/ui/DataTable'
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
  type Receipt,
  type PaymentOrder,
  type Invoice,
  type InvoiceReceived,
  type CreateReceiptInput,
  type CreatePaymentOrderInput,
} from '../../lib/api/finance'

// ─── Main page ────────────────────────────────────────────────────────────────

export function CobrosPage() {
  const can = useAuthStore((s) => s.can)
  const [tab, setTab] = useState<'cobros' | 'pagos'>('cobros')
  const [receiptFormOpen, setReceiptFormOpen] = useState(false)
  const [poFormOpen, setPOFormOpen] = useState(false)
  const [voidReceipt, setVoidReceipt] = useState<Receipt | null>(null)
  const [voidPO, setVoidPO] = useState<PaymentOrder | null>(null)

  const qc = useQueryClient()
  const toast = useUIStore((s) => s.toast)

  const { data: receipts, isLoading, isError, refetch } = useQuery({
    queryKey: ['receipts'],
    queryFn: () => financeApi.receipts.list(),
    enabled: tab === 'cobros',
  })
  const { data: orders, isLoading: loadingOrders, isError: errorOrders, refetch: refetchOrders } = useQuery({
    queryKey: ['payment-orders'],
    queryFn: () => financeApi.paymentOrders.list(),
    enabled: tab === 'pagos',
  })

  const voidReceiptMut = useMutation({
    mutationFn: (id: string) => financeApi.receipts.void(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['receipts'] })
      toast.success('Recibo anulado')
      setVoidReceipt(null)
    },
    onError: () => toast.error('No se pudo anular el recibo'),
  })

  const voidPOMut = useMutation({
    mutationFn: (id: string) => financeApi.paymentOrders.void(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-orders'] })
      toast.success('Orden de pago anulada')
      setVoidPO(null)
    },
    onError: () => toast.error('No se pudo anular la orden'),
  })

  const receiptColumns: Column<Receipt>[] = [
    {
      key: 'number',
      header: 'Nro.',
      render: (r) => <span className="font-mono text-sm">Rec. {String(r.number).padStart(6, '0')}</span>,
    },
    { key: 'date', header: 'Fecha', render: (r) => formatDate(r.date) },
    {
      key: 'total_amount',
      header: 'Importe',
      render: (r) => <span className="font-medium">{formatMoney(r.total_amount, r.currency)}</span>,
    },
    {
      key: 'on_account',
      header: 'A cuenta',
      render: (r) => formatMoney(r.on_account_amount, r.currency),
    },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <div onClick={(e) => e.stopPropagation()}>
          {can('finance', 'edit') && (
            <Button variant="ghost" size="sm" onClick={() => setVoidReceipt(r)} title="Anular">
              <Trash2 size={14} />
            </Button>
          )}
        </div>
      ),
    },
  ]

  const poColumns: Column<PaymentOrder>[] = [
    {
      key: 'number',
      header: 'Nro.',
      render: (p) => <span className="font-mono text-sm">OP {String(p.number).padStart(6, '0')}</span>,
    },
    { key: 'date', header: 'Fecha', render: (p) => formatDate(p.date) },
    {
      key: 'total_amount',
      header: 'Importe',
      render: (p) => <span className="font-medium">{formatMoney(p.total_amount, p.currency)}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (p) => (
        <div onClick={(e) => e.stopPropagation()}>
          {can('finance', 'edit') && (
            <Button variant="ghost" size="sm" onClick={() => setVoidPO(p)} title="Anular">
              <Trash2 size={14} />
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-text">Cobros y Pagos</h1>
        {can('finance', 'create') && (
          <div className="flex gap-2">
            {tab === 'cobros' ? (
              <Button variant="primary" size="lg" onClick={() => setReceiptFormOpen(true)}>
                <Plus size={20} /> Nuevo recibo
              </Button>
            ) : (
              <Button variant="primary" size="lg" onClick={() => setPOFormOpen(true)}>
                <Plus size={20} /> Nueva orden de pago
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex rounded-lg border border-border overflow-hidden w-fit">
        {(['cobros', 'pagos'] as const).map((t) => (
          <button
            key={t}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === t ? 'bg-brand text-white' : 'bg-surface text-text-secondary hover:text-text'
            }`}
            onClick={() => setTab(t)}
          >
            {t === 'cobros' ? 'Recibos de clientes' : 'Órdenes de pago'}
          </button>
        ))}
      </div>

      {tab === 'cobros' ? (
        isError ? (
          <ErrorState message="No pudimos cargar los recibos." onRetry={() => refetch()} />
        ) : (
          <DataTable
            columns={receiptColumns}
            rows={receipts ?? []}
            rowKey={(r) => r.id}
            loading={isLoading}
            emptyState={
              <EmptyState
                icon={<FileText size={28} />}
                title="Sin recibos registrados"
                description="Registrá cobros para mantener el estado de cuenta de tus clientes."
                action={
                  can('finance', 'create')
                    ? { label: 'Nuevo recibo', onClick: () => setReceiptFormOpen(true) }
                    : undefined
                }
              />
            }
          />
        )
      ) : errorOrders ? (
        <ErrorState message="No pudimos cargar las órdenes de pago." onRetry={() => refetchOrders()} />
      ) : (
        <DataTable
          columns={poColumns}
          rows={orders ?? []}
          rowKey={(p) => p.id}
          loading={loadingOrders}
          emptyState={
            <EmptyState
              icon={<FileText size={28} />}
              title="Sin órdenes de pago"
              description="Registrá pagos a proveedores para mantener la cuenta corriente."
              action={
                can('finance', 'create')
                  ? { label: 'Nueva orden', onClick: () => setPOFormOpen(true) }
                  : undefined
              }
            />
          }
        />
      )}

      {receiptFormOpen && (
        <ReceiptForm
          onClose={() => setReceiptFormOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['receipts'] })
            setReceiptFormOpen(false)
          }}
        />
      )}

      {poFormOpen && (
        <PaymentOrderForm
          onClose={() => setPOFormOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['payment-orders'] })
            setPOFormOpen(false)
          }}
        />
      )}

      {voidReceipt && (
        <ConfirmModal
          title="Anular recibo"
          message={`¿Anulás el recibo Nro. ${String(voidReceipt.number).padStart(6, '0')}? Esta acción no se puede deshacer y revertitrá los cobros aplicados.`}
          confirmLabel="Anular recibo"
          variant="danger"
          loading={voidReceiptMut.isPending}
          onConfirm={() => voidReceiptMut.mutate(voidReceipt.id)}
          onClose={() => setVoidReceipt(null)}
        />
      )}

      {voidPO && (
        <ConfirmModal
          title="Anular orden de pago"
          message={`¿Anulás la orden de pago Nro. ${String(voidPO.number).padStart(6, '0')}? Esta acción no se puede deshacer.`}
          confirmLabel="Anular orden"
          variant="danger"
          loading={voidPOMut.isPending}
          onConfirm={() => voidPOMut.mutate(voidPO.id)}
          onClose={() => setVoidPO(null)}
        />
      )}
    </div>
  )
}

// ─── Receipt form ─────────────────────────────────────────────────────────────

const paymentMethodSchema = z.object({
  method_type: z.string().min(1),
  amount: z.string().min(1, 'Requerido'),
  cash_register_id: z.string().optional(),
  bank_account_id: z.string().optional(),
})

const applicationSchema = z.object({
  invoice_id: z.string().uuid(),
  amount: z.string().min(1),
})

const receiptSchema = z.object({
  contact_id: z.string().uuid('Seleccioná un contacto'),
  date: z.string().min(1, 'Requerido'),
  currency: z.string().min(1),
  exchange_rate: z.string().optional(),
  notes: z.string().optional(),
  payment_methods: z.array(paymentMethodSchema).min(1, 'Agregá al menos un medio de pago'),
  applications: z.array(applicationSchema).optional(),
})
type ReceiptFormValues = z.infer<typeof receiptSchema>

function ReceiptForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useUIStore((s) => s.toast)
  const [, setSelectedContactId] = useState('')
  const [pendingInvoices, setPendingInvoices] = useState<Invoice[]>([])

  const { data: cashRegisters } = useQuery({
    queryKey: ['cash-registers'],
    queryFn: () => financeApi.cashRegisters.list(),
  })
  const { data: bankAccounts } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => financeApi.bankAccounts.list(),
  })

  const { register, handleSubmit, control, watch, setValue, formState: { errors } } = useForm<ReceiptFormValues>({
    resolver: zodResolver(receiptSchema),
    defaultValues: {
      date: new Date().toISOString().slice(0, 10),
      currency: 'ARS',
      exchange_rate: '1',
      payment_methods: [{ method_type: 'cash', amount: '', cash_register_id: '' }],
      applications: [],
    },
  })

  const { fields: pmFields, append: appendPM, remove: removePM } = useFieldArray({
    control,
    name: 'payment_methods',
  })

  const { fields: appFields, append: appendApp, remove: removeApp } = useFieldArray({
    control,
    name: 'applications',
  })

  const currency = watch('currency')

  const loadPendingInvoices = async (contactId: string) => {
    if (!contactId) return
    const invoices = await financeApi.invoices.list({
      contact_id: contactId,
      status: 'issued',
    })
    setPendingInvoices(invoices)
  }

  const save = useMutation({
    mutationFn: (data: ReceiptFormValues) => {
      const key = uuidv4()
      const body: CreateReceiptInput = {
        contact_id: data.contact_id,
        date: data.date,
        currency: data.currency,
        exchange_rate: data.exchange_rate || '1',
        notes: data.notes || undefined,
        payment_methods: data.payment_methods.map((pm) => ({
          method_type: pm.method_type,
          amount: pm.amount,
          cash_register_id: pm.cash_register_id || undefined,
          bank_account_id: pm.bank_account_id || undefined,
        })),
        applications: data.applications?.map((a) => ({
          invoice_id: a.invoice_id,
          amount: a.amount,
        })),
      }
      return financeApi.receipts.create(body, key)
    },
    onSuccess: () => {
      toast.success('Recibo registrado')
      onSaved()
    },
    onError: () => toast.error('No se pudo registrar el recibo'),
  })

  const cashOptions =
    cashRegisters?.map((c) => ({ value: c.id, label: c.name })) ?? []
  const bankOptions =
    bankAccounts?.map((b) => ({ value: b.id, label: `${b.bank_name} ${b.alias ?? ''}`.trim() })) ?? []

  const methodTypeOptions = [
    { value: 'cash', label: 'Efectivo' },
    { value: 'bank_transfer', label: 'Transferencia' },
    { value: 'check', label: 'Cheque' },
    { value: 'card', label: 'Tarjeta' },
  ]

  return (
    <SlideOver open onClose={onClose} title="Nuevo recibo" size="lg">
      <form onSubmit={handleSubmit((d) => save.mutate(d))} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text">Cliente</label>
          <ContactPicker
            value={watch('contact_id')}
            onChange={(id) => {
              setValue('contact_id', id, { shouldValidate: true })
              setSelectedContactId(id)
              loadPendingInvoices(id)
            }}
          />
          {errors.contact_id && <p className="text-xs text-danger">{errors.contact_id.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Fecha" type="date" {...register('date')} error={errors.date?.message} />
          <Select
            label="Moneda"
            {...register('currency')}
            options={[
              { value: 'ARS', label: 'ARS' },
              { value: 'USD', label: 'USD' },
            ]}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-text">Medios de pago</label>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => appendPM({ method_type: 'cash', amount: '', cash_register_id: '' })}
            >
              <Plus size={14} /> Agregar
            </Button>
          </div>
          {errors.payment_methods?.root && (
            <p className="text-xs text-danger">{errors.payment_methods.root.message}</p>
          )}
          {pmFields.map((field, idx) => {
            const methodType = watch(`payment_methods.${idx}.method_type`)
            return (
              <div key={field.id} className="flex items-end gap-2 rounded-xl border border-border bg-surface p-3">
                <Select
                  label="Tipo"
                  {...register(`payment_methods.${idx}.method_type`)}
                  options={methodTypeOptions}
                />
                <div className="flex-1 flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-text">Importe</label>
                  <MoneyInput
                    currency={currency}
                    value={watch(`payment_methods.${idx}.amount`)}
                    onChange={(v) => setValue(`payment_methods.${idx}.amount`, v)}
                  />
                </div>
                {methodType === 'cash' && cashOptions.length > 0 && (
                  <Select
                    label="Caja"
                    {...register(`payment_methods.${idx}.cash_register_id`)}
                    options={[{ value: '', label: 'Sin caja' }, ...cashOptions]}
                  />
                )}
                {methodType === 'bank_transfer' && bankOptions.length > 0 && (
                  <Select
                    label="Cuenta"
                    {...register(`payment_methods.${idx}.bank_account_id`)}
                    options={[{ value: '', label: 'Sin cuenta' }, ...bankOptions]}
                  />
                )}
                <button
                  type="button"
                  className="mb-1 text-text-tertiary hover:text-danger"
                  onClick={() => removePM(idx)}
                  disabled={pmFields.length === 1}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            )
          })}
        </div>

        {pendingInvoices.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-text">Imputar a facturas</label>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => appendApp({ invoice_id: '', amount: '' })}
              >
                <Plus size={14} /> Imputar
              </Button>
            </div>
            {appFields.map((field, idx) => (
              <div key={field.id} className="flex items-end gap-2 rounded-xl border border-border bg-surface p-3">
                <div className="flex-1">
                  <Select
                    label="Factura"
                    {...register(`applications.${idx}.invoice_id`)}
                    options={[
                      { value: '', label: 'Seleccioná una factura' },
                      ...pendingInvoices.map((inv) => ({
                        value: inv.id,
                        label: `Fact. ${inv.invoice_type} ${inv.number ? String(inv.number).padStart(8, '0') : 'S/N'} — ${formatMoney(inv.total_amount, inv.currency)}`,
                      })),
                    ]}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-text">Importe</label>
                  <MoneyInput
                    currency={currency}
                    value={watch(`applications.${idx}.amount`)}
                    onChange={(v) => setValue(`applications.${idx}.amount`, v)}
                  />
                </div>
                <button
                  type="button"
                  className="mb-1 text-text-tertiary hover:text-danger"
                  onClick={() => removeApp(idx)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        <Input label="Observaciones" {...register('notes')} />

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" size="md" loading={save.isPending}>
            Registrar recibo
          </Button>
        </div>
      </form>
    </SlideOver>
  )
}

// ─── Payment order form ───────────────────────────────────────────────────────

const poSchema = z.object({
  supplier_id: z.string().uuid('Seleccioná un proveedor'),
  date: z.string().min(1, 'Requerido'),
  currency: z.string().min(1),
  notes: z.string().optional(),
  payment_methods: z.array(paymentMethodSchema).min(1, 'Agregá al menos un medio de pago'),
  applications: z.array(
    z.object({ invoice_received_id: z.string().uuid(), amount: z.string().min(1) }),
  ).optional(),
})
type POFormValues = z.infer<typeof poSchema>

function PaymentOrderForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useUIStore((s) => s.toast)
  const [pendingReceived, setPendingReceived] = useState<InvoiceReceived[]>([])

  const { data: cashRegisters } = useQuery({
    queryKey: ['cash-registers'],
    queryFn: () => financeApi.cashRegisters.list(),
  })
  const { data: bankAccounts } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => financeApi.bankAccounts.list(),
  })

  const { register, handleSubmit, control, watch, setValue, formState: { errors } } = useForm<POFormValues>({
    resolver: zodResolver(poSchema),
    defaultValues: {
      date: new Date().toISOString().slice(0, 10),
      currency: 'ARS',
      payment_methods: [{ method_type: 'bank_transfer', amount: '' }],
      applications: [],
    },
  })

  const { fields: pmFields, append: appendPM, remove: removePM } = useFieldArray({ control, name: 'payment_methods' })
  const { fields: appFields, append: appendApp, remove: removeApp } = useFieldArray({ control, name: 'applications' })

  const currency = watch('currency')

  const loadPendingReceived = async (supplierId: string) => {
    if (!supplierId) return
    const received = await financeApi.invoicesReceived.list({ supplier_id: supplierId, status: 'pending' })
    setPendingReceived(received)
  }

  const save = useMutation({
    mutationFn: (data: POFormValues) => {
      const key = uuidv4()
      const body: CreatePaymentOrderInput = {
        supplier_id: data.supplier_id,
        date: data.date,
        currency: data.currency,
        notes: data.notes || undefined,
        payment_methods: data.payment_methods.map((pm) => ({
          method_type: pm.method_type,
          amount: pm.amount,
          cash_register_id: pm.cash_register_id || undefined,
          bank_account_id: pm.bank_account_id || undefined,
        })),
        applications: data.applications?.map((a) => ({
          invoice_received_id: a.invoice_received_id,
          amount: a.amount,
        })),
      }
      return financeApi.paymentOrders.create(body, key)
    },
    onSuccess: () => {
      toast.success('Orden de pago registrada')
      onSaved()
    },
    onError: () => toast.error('No se pudo registrar la orden de pago'),
  })

  const cashOptions = cashRegisters?.map((c) => ({ value: c.id, label: c.name })) ?? []
  const bankOptions = bankAccounts?.map((b) => ({ value: b.id, label: `${b.bank_name} ${b.alias ?? ''}`.trim() })) ?? []

  const methodTypeOptions = [
    { value: 'cash', label: 'Efectivo' },
    { value: 'bank_transfer', label: 'Transferencia' },
    { value: 'check', label: 'Cheque' },
  ]

  return (
    <SlideOver open onClose={onClose} title="Nueva orden de pago" size="lg">
      <form onSubmit={handleSubmit((d) => save.mutate(d))} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text">Proveedor</label>
          <ContactPicker
            value={watch('supplier_id')}
            onChange={(id) => {
              setValue('supplier_id', id, { shouldValidate: true })
              loadPendingReceived(id)
            }}
          />
          {errors.supplier_id && <p className="text-xs text-danger">{errors.supplier_id.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Fecha" type="date" {...register('date')} error={errors.date?.message} />
          <Select
            label="Moneda"
            {...register('currency')}
            options={[{ value: 'ARS', label: 'ARS' }, { value: 'USD', label: 'USD' }]}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-text">Medios de pago</label>
            <Button type="button" variant="secondary" size="sm" onClick={() => appendPM({ method_type: 'bank_transfer', amount: '' })}>
              <Plus size={14} /> Agregar
            </Button>
          </div>
          {pmFields.map((field, idx) => {
            const methodType = watch(`payment_methods.${idx}.method_type`)
            return (
              <div key={field.id} className="flex items-end gap-2 rounded-xl border border-border bg-surface p-3">
                <Select label="Tipo" {...register(`payment_methods.${idx}.method_type`)} options={methodTypeOptions} />
                <div className="flex-1 flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-text">Importe</label>
                  <MoneyInput currency={currency} value={watch(`payment_methods.${idx}.amount`)} onChange={(v) => setValue(`payment_methods.${idx}.amount`, v)} />
                </div>
                {methodType === 'cash' && cashOptions.length > 0 && (
                  <Select label="Caja" {...register(`payment_methods.${idx}.cash_register_id`)} options={[{ value: '', label: 'Sin caja' }, ...cashOptions]} />
                )}
                {methodType === 'bank_transfer' && bankOptions.length > 0 && (
                  <Select label="Cuenta" {...register(`payment_methods.${idx}.bank_account_id`)} options={[{ value: '', label: 'Sin cuenta' }, ...bankOptions]} />
                )}
                <button type="button" className="mb-1 text-text-tertiary hover:text-danger" onClick={() => removePM(idx)} disabled={pmFields.length === 1}>
                  <Trash2 size={16} />
                </button>
              </div>
            )
          })}
        </div>

        {pendingReceived.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-text">Imputar a facturas recibidas</label>
              <Button type="button" variant="secondary" size="sm" onClick={() => appendApp({ invoice_received_id: '', amount: '' })}>
                <Plus size={14} /> Imputar
              </Button>
            </div>
            {appFields.map((field, idx) => (
              <div key={field.id} className="flex items-end gap-2 rounded-xl border border-border bg-surface p-3">
                <div className="flex-1">
                  <Select
                    label="Factura"
                    {...register(`applications.${idx}.invoice_received_id`)}
                    options={[
                      { value: '', label: 'Seleccioná una factura' },
                      ...pendingReceived.map((inv) => ({
                        value: inv.id,
                        label: `Fact. ${inv.invoice_type ?? ''} — ${formatMoney(inv.total_amount, inv.currency ?? 'ARS')}`,
                      })),
                    ]}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-text">Importe</label>
                  <MoneyInput currency={currency} value={watch(`applications.${idx}.amount`)} onChange={(v) => setValue(`applications.${idx}.amount`, v)} />
                </div>
                <button type="button" className="mb-1 text-text-tertiary hover:text-danger" onClick={() => removeApp(idx)}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        <Input label="Observaciones" {...register('notes')} />

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" size="md" loading={save.isPending}>Registrar orden</Button>
        </div>
      </form>
    </SlideOver>
  )
}
