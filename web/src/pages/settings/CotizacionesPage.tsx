import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, TrendingUp } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Skeleton } from '../../components/ui/Skeleton'
import { useUIStore } from '../../stores/ui'
import { useAuthStore } from '../../stores/auth'
import { adminApi } from '../../lib/api/admin'

const rateSchema = z.object({
  from_currency: z.string().min(1, 'Requerido'),
  to_currency: z.string().min(1, 'Requerido'),
  rate: z.string().min(1, 'Requerido'),
  date: z.string().min(1, 'Requerido'),
  source: z.string().optional(),
})
type RateFormValues = z.infer<typeof rateSchema>

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD — Dólar' },
  { value: 'ARS', label: 'ARS — Peso argentino' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'BRL', label: 'BRL — Real brasileño' },
]

export function CotizacionesPage() {
  const can = useAuthStore((s) => s.can)
  const toast = useUIStore((s) => s.toast)
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)

  const { data: latest, isLoading, isError } = useQuery({
    queryKey: ['exchange-rate-latest'],
    queryFn: () => adminApi.exchangeRates.getLatest('USD', 'ARS'),
  })

  const { register, handleSubmit, formState: { errors } } = useForm<RateFormValues>({
    resolver: zodResolver(rateSchema),
    defaultValues: {
      from_currency: 'USD',
      to_currency: 'ARS',
      date: new Date().toISOString().slice(0, 10),
      source: 'manual',
    },
  })

  const save = useMutation({
    mutationFn: (data: RateFormValues) =>
      adminApi.exchangeRates.create({
        from_currency: data.from_currency,
        to_currency: data.to_currency,
        rate: data.rate,
        date: data.date,
        source: data.source || 'manual',
      }),
    onSuccess: () => {
      toast.success('Cotización registrada')
      setShowForm(false)
      qc.invalidateQueries({ queryKey: ['exchange-rate-latest'] })
    },
    onError: () => toast.error('Error al guardar cotización'),
  })

  if (!can('users', 'view')) {
    return <div className="p-6"><p className="text-text-secondary">Sin permiso.</p></div>
  }

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text">Cotizaciones</h1>
        {can('users', 'manage') && (
          <Button variant="primary" size="md" onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-1" /> Cargar cotización
          </Button>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : isError ? (
        <div className="rounded-xl border border-border bg-surface p-4 text-sm text-text-secondary">
          Sin cotización cargada todavía.
        </div>
      ) : latest && (
        <div className="rounded-xl border border-border bg-surface p-5 flex items-center gap-4">
          <TrendingUp className="w-8 h-8 text-brand flex-shrink-0" />
          <div>
            <p className="text-xs text-text-secondary">{latest.from_currency} / {latest.to_currency}</p>
            <p className="text-2xl font-semibold text-text">{Number(latest.rate).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
            <p className="text-xs text-text-tertiary mt-0.5">
              {latest.date ? new Date(latest.date).toLocaleDateString('es-AR') : '—'}
              {latest.source ? ` · ${latest.source}` : ''}
            </p>
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit((d) => save.mutate(d))} className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-4">
          <p className="text-sm font-semibold text-text">Nueva cotización</p>
          <div className="grid grid-cols-2 gap-3">
            <Select label="De" {...register('from_currency')} options={CURRENCY_OPTIONS} />
            <Select label="A" {...register('to_currency')} options={CURRENCY_OPTIONS} />
          </div>
          <Input label="Tipo de cambio *" {...register('rate')} error={errors.rate?.message} placeholder="Ej: 1050.50" />
          <Input label="Fecha *" type="date" {...register('date')} error={errors.date?.message} />
          <Input label="Fuente" {...register('source')} placeholder="manual, BCRA, dolar blue..." />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="md" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button type="submit" variant="primary" size="md" loading={save.isPending}>Guardar</Button>
          </div>
        </form>
      )}
    </div>
  )
}
