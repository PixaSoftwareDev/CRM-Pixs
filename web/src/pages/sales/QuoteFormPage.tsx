import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, Trash2, AlertTriangle } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { ContactPicker } from '../../components/ui/ContactPicker'
import { ErrorState } from '../../components/ui/ErrorState'
import { Skeleton } from '../../components/ui/Skeleton'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { useUIStore } from '../../stores/ui'
import { formatMoney, formatDate } from '../../lib/utils'
import { currencyOptions, quoteStatusColor, quoteStatusLabel } from '../../lib/crm'
import { quotesApi, productsApi, type CreateQuoteInput, type QuoteItem } from '../../lib/api/sales'

type ItemRow = {
  product_id?: string
  description: string
  quantity: string
  unit_price: string
  discount_pct: string
  vat_rate_pct: string
}

const emptyRow = (): ItemRow => ({
  description: '',
  quantity: '1',
  unit_price: '0',
  discount_pct: '0',
  vat_rate_pct: '21',
})

function lineSubtotal(r: ItemRow): number {
  const qty = parseFloat(r.quantity) || 0
  const price = parseFloat(r.unit_price) || 0
  const disc = parseFloat(r.discount_pct) || 0
  return qty * price * (1 - disc / 100)
}
function lineTax(r: ItemRow): number {
  return lineSubtotal(r) * ((parseFloat(r.vat_rate_pct) || 0) / 100)
}

export function QuoteFormPage() {
  const { id } = useParams()
  const isEdit = !!id
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useUIStore((s) => s.toast)

  const existingQ = useQuery({
    queryKey: ['quote', id],
    queryFn: () => quotesApi.get(id!),
    enabled: isEdit,
  })
  const versionsQ = useQuery({
    queryKey: ['quote', id, 'versions'],
    queryFn: () => quotesApi.versions(id!),
    enabled: isEdit,
  })
  const productsQ = useQuery({ queryKey: ['products'], queryFn: () => productsApi.list(true) })

  const today = new Date().toISOString().slice(0, 10)
  const existing = existingQ.data

  const [contactId, setContactId] = useState('')
  const [date, setDate] = useState(today)
  const [validUntil, setValidUntil] = useState('')
  const [currency, setCurrency] = useState('ARS')
  const [notes, setNotes] = useState('')
  const [rows, setRows] = useState<ItemRow[]>([emptyRow()])
  const [hydrated, setHydrated] = useState(false)

  // Hydrate state once existing data arrives.
  if (isEdit && existing && !hydrated) {
    setContactId(existing.contact_id)
    setDate(existing.date.slice(0, 10))
    setValidUntil(existing.valid_until?.slice(0, 10) ?? '')
    setCurrency(existing.currency)
    setNotes(existing.notes ?? '')
    setRows(
      (existing.items ?? []).map((i: QuoteItem) => ({
        product_id: i.product_id,
        description: i.description,
        quantity: i.quantity,
        unit_price: i.unit_price,
        discount_pct: i.discount_pct,
        vat_rate_pct: i.vat_rate_pct,
      })) || [emptyRow()],
    )
    setHydrated(true)
  }

  const totals = useMemo(() => {
    let sub = 0
    let tax = 0
    rows.forEach((r) => {
      sub += lineSubtotal(r)
      tax += lineTax(r)
    })
    return { sub, tax, total: sub + tax }
  }, [rows])

  const save = useMutation({
    mutationFn: (body: CreateQuoteInput) =>
      isEdit ? quotesApi.update(id!, body) : quotesApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotes'] })
      toast.success(isEdit ? 'Presupuesto actualizado' : 'Presupuesto creado')
      navigate('/ventas/presupuestos')
    },
    onError: () => toast.error('No se pudo guardar el presupuesto'),
  })

  const updateRow = (idx: number, patch: Partial<ItemRow>) =>
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!contactId) {
      toast.error('Elegí un contacto')
      return
    }
    const valid = rows.filter((r) => r.description.trim())
    if (valid.length === 0) {
      toast.error('Agregá al menos un item')
      return
    }
    save.mutate({
      contact_id: contactId,
      date,
      valid_until: validUntil || undefined,
      currency,
      notes: notes || undefined,
      items: valid.map((r, i) => ({
        product_id: r.product_id,
        description: r.description,
        quantity: r.quantity,
        unit_price: r.unit_price,
        discount_pct: r.discount_pct,
        vat_rate_pct: r.vat_rate_pct,
        order_pos: i,
      })),
    })
  }

  if (isEdit && existingQ.isLoading) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }
  if (isEdit && existingQ.isError) {
    return (
      <div className="p-4 md:p-6">
        <ErrorState message="No pudimos cargar el presupuesto." onRetry={() => existingQ.refetch()} />
      </div>
    )
  }

  const showVersionWarning = isEdit && existing && ['sent', 'accepted'].includes(existing.status)

  return (
    <form onSubmit={submit} className="space-y-6 p-4 md:p-6">
      <button
        type="button"
        onClick={() => navigate('/ventas/presupuestos')}
        className="flex items-center gap-1 text-sm text-text-secondary hover:text-text"
      >
        <ArrowLeft size={16} /> Volver a presupuestos
      </button>

      <h1 className="text-2xl font-semibold text-text">
        {isEdit ? 'Editar presupuesto' : 'Nuevo presupuesto'}
      </h1>

      {showVersionWarning && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-400">
          <AlertTriangle size={16} />
          Al guardar se creará una versión nueva del presupuesto.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-surface p-5 sm:grid-cols-2">
        <ContactPicker label="Contacto" required value={contactId} onChange={(c) => setContactId(c)} />
        <Select
          label="Moneda"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          options={currencyOptions}
        />
        <Input label="Fecha" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Input
          label="Válido hasta"
          type="date"
          value={validUntil}
          onChange={(e) => setValidUntil(e.target.value)}
        />
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-text">Items</h2>
          <Button type="button" variant="secondary" size="sm" onClick={() => setRows([...rows, emptyRow()])}>
            <Plus size={14} /> Agregar item
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-secondary">
                <th className="py-2 pr-2">Descripción</th>
                <th className="py-2 px-2 w-20">Cant.</th>
                <th className="py-2 px-2 w-28">P. unit.</th>
                <th className="py-2 px-2 w-20">Desc %</th>
                <th className="py-2 px-2 w-20">IVA %</th>
                <th className="py-2 px-2 w-28 text-right">Subtotal</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={idx} className="border-t border-border">
                  <td className="py-2 pr-2">
                    <input
                      value={r.description}
                      onChange={(e) => updateRow(idx, { description: e.target.value })}
                      placeholder="Descripción del item"
                      className="h-9 w-full min-w-[160px] rounded border border-border bg-surface px-2 text-sm text-text focus:border-brand focus:outline-none"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="number"
                      value={r.quantity}
                      onChange={(e) => updateRow(idx, { quantity: e.target.value })}
                      className="h-9 w-full rounded border border-border bg-surface px-2 text-sm text-text focus:border-brand focus:outline-none"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="number"
                      value={r.unit_price}
                      onChange={(e) => updateRow(idx, { unit_price: e.target.value })}
                      className="h-9 w-full rounded border border-border bg-surface px-2 text-sm text-text focus:border-brand focus:outline-none"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="number"
                      value={r.discount_pct}
                      onChange={(e) => updateRow(idx, { discount_pct: e.target.value })}
                      className="h-9 w-full rounded border border-border bg-surface px-2 text-sm text-text focus:border-brand focus:outline-none"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="number"
                      value={r.vat_rate_pct}
                      onChange={(e) => updateRow(idx, { vat_rate_pct: e.target.value })}
                      className="h-9 w-full rounded border border-border bg-surface px-2 text-sm text-text focus:border-brand focus:outline-none"
                    />
                  </td>
                  <td className="py-2 px-2 text-right text-text">
                    {formatMoney(lineSubtotal(r) + lineTax(r), currency)}
                  </td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => setRows(rows.filter((_, i) => i !== idx))}
                      className="text-text-tertiary hover:text-danger"
                      aria-label="Quitar item"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ml-auto w-full max-w-xs space-y-1 pt-2">
          <Row label="Subtotal" value={formatMoney(totals.sub, currency)} />
          <Row label="IVA" value={formatMoney(totals.tax, currency)} />
          <div className="flex items-center justify-between border-t border-border pt-2">
            <span className="text-base font-semibold text-text">Total</span>
            <span className="text-lg font-semibold text-text">{formatMoney(totals.total, currency)}</span>
          </div>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-text">Notas</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full rounded border border-border bg-surface p-3 text-base text-text focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" size="md" onClick={() => navigate('/ventas/presupuestos')}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" size="lg" loading={save.isPending}>
          Guardar presupuesto
        </Button>
      </div>

      {isEdit && (versionsQ.data?.length ?? 0) > 0 && (
        <div className="space-y-2 rounded-xl border border-border bg-surface p-5">
          <h2 className="text-base font-semibold text-text">Versiones anteriores</h2>
          <ul className="space-y-1">
            {versionsQ.data!.map((v) => (
              <li key={v.id} className="flex items-center justify-between text-sm">
                <span className="text-text">
                  {v.number ?? '—'} {v.version ? `v${v.version}` : ''} · {formatDate(v.date)}
                </span>
                <StatusBadge
                  label={quoteStatusLabel[v.status] ?? v.status}
                  color={quoteStatusColor[v.status] ?? 'neutral'}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {productsQ.data && productsQ.data.length > 0 && (
        <p className="text-xs text-text-tertiary">
          Tip: hay {productsQ.data.length} productos en el catálogo para usar como referencia de precios.
        </p>
      )}
    </form>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-text-secondary">{label}</span>
      <span className="text-text">{value}</span>
    </div>
  )
}
