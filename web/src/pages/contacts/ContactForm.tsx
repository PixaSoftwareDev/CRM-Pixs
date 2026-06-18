import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SlideOver } from '../../components/ui/SlideOver'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Button } from '../../components/ui/Button'
import { useUIStore } from '../../stores/ui'
import { useAuthStore } from '../../stores/auth'
import { ApiRequestError } from '../../lib/api/client'
import {
  contactsApi,
  type Contact,
  type CreateContactInput,
} from '../../lib/api/contacts'
import {
  contactKinds,
  contactKindLabel,
  lifecycleOptions,
  vatConditionOptions,
  validateCUIT,
} from '../../lib/crm'

interface ContactFormProps {
  open: boolean
  onClose: () => void
  contact?: Contact | null
}

const empty = (selfId?: string): CreateContactInput => ({
  kind: ['cliente'],
  fantasy_name: '',
  legal_name: '',
  cuit_cuil: '',
  vat_condition: '',
  fiscal_address: '',
  city: '',
  province: '',
  postal_code: '',
  email: '',
  phone: '',
  website: '',
  industry: '',
  source: '',
  usual_discount_pct: '0',
  assigned_user_id: selfId,
  lifecycle_status: 'active',
})

export function ContactForm({ open, onClose, contact }: ContactFormProps) {
  const qc = useQueryClient()
  const toast = useUIStore((s) => s.toast)
  const selfId = useAuthStore((s) => s.user?.user_id)

  const [form, setForm] = useState<CreateContactInput>(() =>
    contact
      ? {
          kind: contact.kind,
          fantasy_name: contact.fantasy_name,
          legal_name: contact.legal_name ?? '',
          cuit_cuil: contact.cuit_cuil ?? '',
          vat_condition: contact.vat_condition ?? '',
          fiscal_address: contact.fiscal_address ?? '',
          city: contact.city ?? '',
          province: contact.province ?? '',
          postal_code: contact.postal_code ?? '',
          email: contact.email ?? '',
          phone: contact.phone ?? '',
          website: contact.website ?? '',
          industry: contact.industry ?? '',
          source: contact.source ?? '',
          credit_limit: contact.credit_limit,
          usual_discount_pct: contact.usual_discount_pct ?? '0',
          assigned_user_id: contact.assigned_user_id ?? selfId,
          lifecycle_status: contact.lifecycle_status,
        }
      : empty(selfId),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

  const set = <K extends keyof CreateContactInput>(k: K, v: CreateContactInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const toggleKind = (k: string) => {
    setForm((f) => {
      const has = f.kind.includes(k)
      const next = has ? f.kind.filter((x) => x !== k) : [...f.kind, k]
      return { ...f, kind: next }
    })
  }

  const mutation = useMutation({
    mutationFn: (body: CreateContactInput) =>
      contact ? contactsApi.update(contact.id, body) : contactsApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] })
      if (contact) qc.invalidateQueries({ queryKey: ['contact', contact.id] })
      toast.success(contact ? 'Contacto actualizado' : 'Contacto creado')
      onClose()
    },
    onError: (e) => {
      const msg = e instanceof ApiRequestError ? e.error.message : 'Error al guardar el contacto'
      toast.error(msg)
    },
  })

  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    if (!form.fantasy_name.trim()) errs.fantasy_name = 'Ingresá un nombre de fantasía'
    if (form.kind.length === 0) errs.kind = 'Elegí al menos un tipo'
    if (form.cuit_cuil && form.cuit_cuil.trim() && !validateCUIT(form.cuit_cuil)) {
      errs.cuit_cuil = 'CUIT/CUIL inválido'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    // Strip empty optional strings to undefined for cleanliness.
    const body: CreateContactInput = {
      ...form,
      fantasy_name: form.fantasy_name.trim(),
      usual_discount_pct: form.usual_discount_pct || '0',
    }
    mutation.mutate(body)
  }

  return (
    <SlideOver open={open} onClose={onClose} title={contact ? 'Editar contacto' : 'Nuevo contacto'} size="lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-text">Tipo</legend>
          <div className="flex flex-wrap gap-2">
            {contactKinds.map((k) => {
              const active = form.kind.includes(k)
              return (
                <button
                  type="button"
                  key={k}
                  onClick={() => toggleKind(k)}
                  className={
                    'rounded-full border px-3 py-1.5 text-sm transition-colors ' +
                    (active
                      ? 'border-brand bg-brand text-white'
                      : 'border-border bg-surface text-text-secondary hover:border-border-strong')
                  }
                >
                  {contactKindLabel[k]}
                </button>
              )
            })}
          </div>
          {errors.kind && <p className="mt-1 text-xs text-danger">{errors.kind}</p>}
        </fieldset>

        <Input
          label="Nombre de fantasía"
          value={form.fantasy_name}
          onChange={(e) => set('fantasy_name', e.target.value)}
          error={errors.fantasy_name}
          required
        />
        <Input
          label="Razón social"
          value={form.legal_name ?? ''}
          onChange={(e) => set('legal_name', e.target.value)}
        />
        <Input
          label="CUIT / CUIL"
          value={form.cuit_cuil ?? ''}
          onChange={(e) => set('cuit_cuil', e.target.value)}
          onBlur={() => {
            if (form.cuit_cuil && form.cuit_cuil.trim() && !validateCUIT(form.cuit_cuil)) {
              setErrors((s) => ({ ...s, cuit_cuil: 'CUIT/CUIL inválido' }))
            } else {
              setErrors((s) => {
                const { cuit_cuil, ...rest } = s
                return rest
              })
            }
          }}
          error={errors.cuit_cuil}
          placeholder="20-12345678-9"
        />
        <Select
          label="Condición de IVA"
          placeholder="Seleccioná una condición"
          value={form.vat_condition ?? ''}
          onChange={(e) => set('vat_condition', e.target.value)}
          options={vatConditionOptions}
        />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Ciudad" value={form.city ?? ''} onChange={(e) => set('city', e.target.value)} />
          <Input
            label="Provincia"
            value={form.province ?? ''}
            onChange={(e) => set('province', e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Email"
            type="email"
            value={form.email ?? ''}
            onChange={(e) => set('email', e.target.value)}
          />
          <Input label="Teléfono" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
        </div>
        <Input label="Sitio web" value={form.website ?? ''} onChange={(e) => set('website', e.target.value)} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Rubro" value={form.industry ?? ''} onChange={(e) => set('industry', e.target.value)} />
          <Input
            label="Descuento habitual %"
            type="number"
            value={form.usual_discount_pct}
            onChange={(e) => set('usual_discount_pct', e.target.value)}
          />
        </div>
        <Select
          label="Estado"
          value={form.lifecycle_status}
          onChange={(e) => set('lifecycle_status', e.target.value)}
          options={lifecycleOptions}
        />

        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" size="md" loading={mutation.isPending}>
            {contact ? 'Guardar cambios' : 'Crear contacto'}
          </Button>
        </div>
      </form>
    </SlideOver>
  )
}
