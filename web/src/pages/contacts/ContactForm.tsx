import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
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
import { pipelineApi, opportunitiesApi } from '../../lib/api/sales'
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

interface PersonDraft {
  name: string
  role: string
  phone: string
  email: string
}

const emptyPerson = (): PersonDraft => ({ name: '', role: '', phone: '', email: '' })

const empty = (selfId?: string): CreateContactInput => ({
  kind: ['client'],
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
  lifecycle_status: 'active_client',
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
  const [persons, setPersons] = useState<PersonDraft[]>([])
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

  const addPerson = () => setPersons((p) => [...p, emptyPerson()])
  const removePerson = (i: number) => setPersons((p) => p.filter((_, idx) => idx !== i))
  const setPerson = (i: number, field: keyof PersonDraft, value: string) =>
    setPersons((p) => p.map((p2, idx) => (idx === i ? { ...p2, [field]: value } : p2)))

  const stagesQ = useQuery({ queryKey: ['pipeline-stages'], queryFn: () => pipelineApi.stages() })
  const firstStageId = stagesQ.data?.[0]?.id

  const mutation = useMutation({
    mutationFn: async (body: CreateContactInput) => {
      const saved = contact
        ? await contactsApi.update(contact.id, body)
        : await contactsApi.create(body)

      // Create persons after the contact exists (only on create)
      if (!contact) {
        for (const p of persons) {
          if (!p.name.trim()) continue
          await contactsApi.persons.create(saved.id, {
            name: p.name.trim(),
            role: p.role.trim() || undefined,
            phone: p.phone.trim() || undefined,
            email: p.email.trim() || undefined,
            is_primary: false,
          })
        }
      }

      // Auto-create pipeline opportunity when status is prospect or opportunity.
      const wantsPipeline = body.lifecycle_status === 'prospect' || body.lifecycle_status === 'opportunity'
      const statusChanged = !contact || contact.lifecycle_status !== body.lifecycle_status
      if (wantsPipeline && statusChanged && firstStageId) {
        // Only create if contact doesn't already have an open opportunity
        const existing = await opportunitiesApi.list({ contact_id: saved.id })
        if (!existing || existing.length === 0) {
          await opportunitiesApi.create({
            contact_id: saved.id,
            stage_id: firstStageId!,
            title: saved.fantasy_name || saved.legal_name || 'Sin nombre',
            currency: 'ARS',
          })
        }
      }

      return saved
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] })
      qc.invalidateQueries({ queryKey: ['opportunities'] })
      qc.invalidateQueries({ queryKey: ['pipeline-forecast'] })
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
    const str = (v: string | undefined | null) => v?.trim() || undefined
    const body: CreateContactInput = {
      kind: form.kind,
      fantasy_name: form.fantasy_name.trim(),
      lifecycle_status: form.lifecycle_status,
      usual_discount_pct: form.usual_discount_pct || '0',
      legal_name:       str(form.legal_name),
      cuit_cuil:        str(form.cuit_cuil),
      vat_condition:    str(form.vat_condition),
      fiscal_address:   str(form.fiscal_address),
      city:             str(form.city),
      province:         str(form.province),
      postal_code:      str(form.postal_code),
      email:            str(form.email),
      phone:            str(form.phone),
      website:          str(form.website),
      industry:         str(form.industry),
      source:           str(form.source),
      credit_limit:     form.credit_limit || undefined,
      assigned_user_id: form.assigned_user_id || undefined,
    }
    mutation.mutate(body)
  }

  return (
    <SlideOver open={open} onClose={onClose} title={contact ? 'Editar contacto' : 'Nuevo contacto'} size="lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">

        {/* Tipo */}
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

        {/* Datos de la empresa */}
        <Input
          label="Nombre de fantasía *"
          value={form.fantasy_name}
          onChange={(e) => set('fantasy_name', e.target.value)}
          error={errors.fantasy_name}
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
              setErrors((s) => { const { cuit_cuil, ...rest } = s; return rest })
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
          <Input label="Provincia" value={form.province ?? ''} onChange={(e) => set('province', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Email empresa" type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} />
          <Input label="Teléfono empresa" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Rubro" value={form.industry ?? ''} onChange={(e) => set('industry', e.target.value)} />
          <Input label="Sitio web" value={form.website ?? ''} onChange={(e) => set('website', e.target.value)} />
        </div>
        <Select
          label="Estado"
          value={form.lifecycle_status}
          onChange={(e) => set('lifecycle_status', e.target.value)}
          options={lifecycleOptions}
        />

        {/* Personas de contacto */}
        {!contact && (
          <div className="border-t border-border pt-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-text">Personas de contacto</p>
              <button
                type="button"
                onClick={addPerson}
                className="flex items-center gap-1 text-xs text-brand hover:underline"
              >
                <Plus size={13} /> Agregar persona
              </button>
            </div>

            {persons.length === 0 && (
              <p className="text-xs text-text-tertiary">
                Opcional — podés agregar personas después desde el detalle del contacto.
              </p>
            )}

            {persons.map((p, i) => (
              <div key={i} className="rounded-lg border border-border bg-surface-subtle p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-text-secondary">Persona {i + 1}</span>
                  <button
                    type="button"
                    onClick={() => removePerson(i)}
                    className="text-text-tertiary hover:text-danger transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    label="Nombre *"
                    value={p.name}
                    onChange={(e) => setPerson(i, 'name', e.target.value)}
                    placeholder="Juan García"
                  />
                  <Input
                    label="Cargo / Rol"
                    value={p.role}
                    onChange={(e) => setPerson(i, 'role', e.target.value)}
                    placeholder="Gerente de compras"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    label="Teléfono"
                    value={p.phone}
                    onChange={(e) => setPerson(i, 'phone', e.target.value)}
                    placeholder="+54 11 1234-5678"
                  />
                  <Input
                    label="Email"
                    type="email"
                    value={p.email}
                    onChange={(e) => setPerson(i, 'email', e.target.value)}
                    placeholder="juan@empresa.com"
                  />
                </div>
              </div>
            ))}
          </div>
        )}

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
