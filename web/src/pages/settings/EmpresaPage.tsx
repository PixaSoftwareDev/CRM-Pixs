import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Save } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Skeleton } from '../../components/ui/Skeleton'
import { ErrorState } from '../../components/ui/ErrorState'
import { useUIStore } from '../../stores/ui'
import { useAuthStore } from '../../stores/auth'
import { adminApi } from '../../lib/api/admin'

const companySchema = z.object({
  legal_name: z.string().min(1, 'Requerido'),
  fantasy_name: z.string().min(1, 'Requerido'),
  cuit: z.string().optional(),
  vat_condition: z.string().optional(),
  fiscal_address: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  postal_code: z.string().optional(),
  gross_income: z.string().optional(),
  activity_start_date: z.string().optional(),
})
type CompanyFormValues = z.infer<typeof companySchema>

const VAT_CONDITIONS = [
  { value: '', label: 'Sin especificar' },
  { value: 'Responsable Inscripto', label: 'Responsable Inscripto' },
  { value: 'Monotributista', label: 'Monotributista' },
  { value: 'Exento', label: 'Exento' },
  { value: 'Consumidor Final', label: 'Consumidor Final' },
]

export function EmpresaPage() {
  const can = useAuthStore((s) => s.can)
  const toast = useUIStore((s) => s.toast)
  const qc = useQueryClient()

  const { data: company, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-company'],
    queryFn: adminApi.company.get,
  })

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema),
  })

  useEffect(() => {
    if (company) {
      reset({
        legal_name: company.legal_name,
        fantasy_name: company.fantasy_name,
        cuit: company.cuit ?? '',
        vat_condition: company.vat_condition ?? '',
        fiscal_address: company.fiscal_address ?? '',
        city: company.city ?? '',
        province: company.province ?? '',
        postal_code: company.postal_code ?? '',
        gross_income: company.gross_income ?? '',
        activity_start_date: company.activity_start_date ? company.activity_start_date.slice(0, 10) : '',
      })
    }
  }, [company, reset])

  const update = useMutation({
    mutationFn: (data: CompanyFormValues) => adminApi.company.update({
      legal_name: data.legal_name,
      fantasy_name: data.fantasy_name,
      cuit: data.cuit || undefined,
      vat_condition: data.vat_condition || undefined,
      fiscal_address: data.fiscal_address || undefined,
      city: data.city || undefined,
      province: data.province || undefined,
      postal_code: data.postal_code || undefined,
      gross_income: data.gross_income || undefined,
      activity_start_date: data.activity_start_date || undefined,
    }),
    onSuccess: () => {
      toast.success('Datos de empresa actualizados')
      qc.invalidateQueries({ queryKey: ['admin-company'] })
    },
    onError: () => toast.error('No se pudieron guardar los cambios'),
  })

  if (!can('users', 'view')) {
    return <div className="p-6"><p className="text-text-secondary">Sin permiso.</p></div>
  }

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-2xl">
      <h1 className="text-2xl font-semibold text-text">Empresa</h1>

      {isLoading ? (
        <div className="space-y-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : isError ? (
        <ErrorState message="No se pudieron cargar los datos." onRetry={() => refetch()} />
      ) : (
        <form onSubmit={handleSubmit((d) => update.mutate(d))} className="flex flex-col gap-4">
          <div className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-4">
            <p className="text-sm font-semibold text-text-secondary uppercase tracking-wide">Datos fiscales</p>
            <Input label="Razón social *" {...register('legal_name')} error={errors.legal_name?.message} />
            <Input label="Nombre de fantasía *" {...register('fantasy_name')} error={errors.fantasy_name?.message} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="CUIT" {...register('cuit')} placeholder="30-12345678-9" />
              <Select label="Condición IVA" {...register('vat_condition')} options={VAT_CONDITIONS} />
            </div>
            <Input label="IIBB (nro. ingresos brutos)" {...register('gross_income')} />
            <Input label="Inicio de actividades" type="date" {...register('activity_start_date')} />
          </div>

          <div className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-4">
            <p className="text-sm font-semibold text-text-secondary uppercase tracking-wide">Domicilio fiscal</p>
            <Input label="Dirección" {...register('fiscal_address')} />
            <div className="grid grid-cols-3 gap-3">
              <Input label="Ciudad" {...register('city')} />
              <Input label="Provincia" {...register('province')} />
              <Input label="CP" {...register('postal_code')} />
            </div>
          </div>

          {can('users', 'manage') && (
            <Button type="submit" variant="primary" size="md" className="self-start" loading={update.isPending}>
              <Save className="w-4 h-4 mr-1" /> Guardar cambios
            </Button>
          )}
        </form>
      )}
    </div>
  )
}
