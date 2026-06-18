import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Star,
  Plus,
  FileText,
  Calendar,
  TrendingUp,
  DollarSign,
} from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { SlideOver } from '../../components/ui/SlideOver'
import { Input } from '../../components/ui/Input'
import { ConfirmModal } from '../../components/ui/Modal'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { Skeleton } from '../../components/ui/Skeleton'
import { useAuthStore } from '../../stores/auth'
import { useUIStore } from '../../stores/ui'
import { formatRelativeTime, formatDate, cn } from '../../lib/utils'
import {
  contactsApi,
  type ContactPerson,
  type PersonInput,
  type BankAccountInput,
  type TimelineEntry,
} from '../../lib/api/contacts'
import {
  contactKindColor,
  contactKindLabel,
  lifecycleColor,
  lifecycleLabel,
  currencyOptions,
} from '../../lib/crm'
import { ContactForm } from './ContactForm'

type Tab = 'personas' | 'cuentas' | 'notas' | 'timeline'

export function ContactDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const can = useAuthStore((s) => s.can)
  const toast = useUIStore((s) => s.toast)
  const [tab, setTab] = useState<Tab>('personas')
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const { data: contact, isLoading, isError, refetch } = useQuery({
    queryKey: ['contact', id],
    queryFn: () => contactsApi.get(id),
    enabled: !!id,
  })

  const deleteMutation = useMutation({
    mutationFn: () => contactsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] })
      toast.success('Contacto eliminado')
      navigate('/contactos')
    },
    onError: () => toast.error('No se pudo eliminar el contacto'),
  })

  if (isLoading) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }
  if (isError || !contact) {
    return (
      <div className="p-4 md:p-6">
        <ErrorState message="No pudimos cargar el contacto." onRetry={() => refetch()} />
      </div>
    )
  }

  const canEdit = can('contacts', 'edit') || can('contacts', 'update')
  const canDelete = can('contacts', 'delete')

  const tabs: { key: Tab; label: string }[] = [
    { key: 'personas', label: 'Personas' },
    { key: 'cuentas', label: 'Cuentas bancarias' },
    { key: 'notas', label: 'Notas' },
    { key: 'timeline', label: 'Timeline' },
  ]

  return (
    <div className="space-y-6 p-4 md:p-6">
      <button
        onClick={() => navigate('/contactos')}
        className="flex items-center gap-1 text-sm text-text-secondary hover:text-text"
      >
        <ArrowLeft size={16} /> Volver a contactos
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-text">{contact.fantasy_name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {contact.kind.map((k) => (
              <StatusBadge key={k} label={contactKindLabel[k] ?? k} color={contactKindColor[k] ?? 'neutral'} />
            ))}
            <StatusBadge
              label={lifecycleLabel[contact.lifecycle_status] ?? contact.lifecycle_status}
              color={lifecycleColor[contact.lifecycle_status] ?? 'neutral'}
            />
          </div>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <Button variant="secondary" size="md" onClick={() => setEditOpen(true)}>
              <Pencil size={16} /> Editar
            </Button>
          )}
          {canDelete && (
            <Button variant="ghost" size="md" onClick={() => setDeleteOpen(true)}>
              <Trash2 size={16} />
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-surface p-5 sm:grid-cols-3">
        <Field label="CUIT/CUIL" value={contact.cuit_cuil} />
        <Field label="Condición IVA" value={contact.vat_condition} />
        <Field label="Ciudad" value={[contact.city, contact.province].filter(Boolean).join(', ')} />
        <Field label="Email" value={contact.email} />
        <Field label="Teléfono" value={contact.phone} />
        <Field label="Sitio web" value={contact.website} />
      </div>

      <div className="border-b border-border">
        <nav className="flex gap-1 overflow-x-auto" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                tab === t.key
                  ? 'border-brand text-text'
                  : 'border-transparent text-text-secondary hover:text-text',
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'personas' && <PersonsTab contactId={id} canEdit={canEdit} />}
      {tab === 'cuentas' && <BankAccountsTab contactId={id} canEdit={canEdit} />}
      {tab === 'notas' && <NotesTab contactId={id} canEdit={canEdit} />}
      {tab === 'timeline' && <TimelineTab contactId={id} />}

      {editOpen && <ContactForm open={editOpen} onClose={() => setEditOpen(false)} contact={contact} />}
      <ConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
        loading={deleteMutation.isPending}
        title="Eliminar contacto"
        description={`Eliminar a ${contact.fantasy_name}. Esta acción no se puede deshacer.`}
      />
    </div>
  )
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-xs text-text-tertiary">{label}</p>
      <p className="text-sm text-text">{value || '—'}</p>
    </div>
  )
}

// ---------------- Personas ----------------

function PersonsTab({ contactId, canEdit }: { contactId: string; canEdit: boolean }) {
  const qc = useQueryClient()
  const toast = useUIStore((s) => s.toast)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ContactPerson | null>(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['contact', contactId, 'persons'],
    queryFn: () => contactsApi.persons.list(contactId),
  })

  const del = useMutation({
    mutationFn: (personId: string) => contactsApi.persons.delete(contactId, personId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact', contactId, 'persons'] })
      toast.success('Persona eliminada')
    },
    onError: () => toast.error('No se pudo eliminar'),
  })

  if (isLoading) return <Skeleton className="h-24 w-full" />
  if (isError) return <ErrorState onRetry={() => refetch()} />

  const persons = data ?? []

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex justify-end">
          <Button
            variant="secondary"
            size="md"
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus size={16} /> Agregar persona
          </Button>
        </div>
      )}
      {persons.length === 0 ? (
        <EmptyState title="Sin personas de contacto" description="Agregá a quién contactar en esta empresa." />
      ) : (
        <ul className="space-y-2">
          {persons.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-xl border border-border bg-surface p-4"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-text">{p.name}</span>
                  {p.is_primary && <Star size={14} className="fill-amber-400 text-amber-400" />}
                  {p.role && <span className="text-xs text-text-tertiary">· {p.role}</span>}
                </div>
                <p className="text-sm text-text-secondary">
                  {[p.email, p.phone].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
              {canEdit && (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(p)
                      setFormOpen(true)
                    }}
                  >
                    <Pencil size={14} />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => del.mutate(p.id)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {formOpen && (
        <PersonForm
          contactId={contactId}
          person={editing}
          onClose={() => setFormOpen(false)}
        />
      )}
    </div>
  )
}

function PersonForm({
  contactId,
  person,
  onClose,
}: {
  contactId: string
  person: ContactPerson | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const toast = useUIStore((s) => s.toast)
  const [form, setForm] = useState<PersonInput>({
    name: person?.name ?? '',
    role: person?.role ?? '',
    email: person?.email ?? '',
    phone: person?.phone ?? '',
    notes: person?.notes ?? '',
    birthday: person?.birthday ?? '',
    is_primary: person?.is_primary ?? false,
  })

  const mutation = useMutation({
    mutationFn: (body: PersonInput) =>
      person
        ? contactsApi.persons.update(contactId, person.id, body)
        : contactsApi.persons.create(contactId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact', contactId, 'persons'] })
      toast.success(person ? 'Persona actualizada' : 'Persona agregada')
      onClose()
    },
    onError: () => toast.error('No se pudo guardar'),
  })

  return (
    <SlideOver open onClose={onClose} title={person ? 'Editar persona' : 'Agregar persona'}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!form.name.trim()) return
          mutation.mutate(form)
        }}
      >
        <Input label="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <Input label="Cargo" value={form.role ?? ''} onChange={(e) => setForm({ ...form, role: e.target.value })} />
        <Input label="Email" type="email" value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Input label="Teléfono" value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={form.is_primary}
            onChange={(e) => setForm({ ...form, is_primary: e.target.checked })}
            className="h-4 w-4 rounded border-border accent-brand"
          />
          Contacto principal
        </label>
        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" size="md" loading={mutation.isPending}>
            Guardar
          </Button>
        </div>
      </form>
    </SlideOver>
  )
}

// ---------------- Bank accounts ----------------

function BankAccountsTab({ contactId, canEdit }: { contactId: string; canEdit: boolean }) {
  const qc = useQueryClient()
  const toast = useUIStore((s) => s.toast)
  const [formOpen, setFormOpen] = useState(false)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['contact', contactId, 'bank-accounts'],
    queryFn: () => contactsApi.bankAccounts.list(contactId),
  })

  const del = useMutation({
    mutationFn: (accountId: string) => contactsApi.bankAccounts.delete(contactId, accountId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact', contactId, 'bank-accounts'] })
      toast.success('Cuenta eliminada')
    },
    onError: () => toast.error('No se pudo eliminar'),
  })

  if (isLoading) return <Skeleton className="h-24 w-full" />
  if (isError) return <ErrorState onRetry={() => refetch()} />

  const accounts = data ?? []

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex justify-end">
          <Button variant="secondary" size="md" onClick={() => setFormOpen(true)}>
            <Plus size={16} /> Agregar cuenta
          </Button>
        </div>
      )}
      {accounts.length === 0 ? (
        <EmptyState title="Sin cuentas bancarias" description="Agregá una cuenta para pagos y cobros." />
      ) : (
        <ul className="space-y-2">
          {accounts.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between rounded-xl border border-border bg-surface p-4"
            >
              <div>
                <p className="font-mono text-sm text-text">•••• •••• {a.cbu.slice(-4)}</p>
                <p className="text-sm text-text-secondary">
                  {[a.alias, a.bank_name, a.currency].filter(Boolean).join(' · ')}
                </p>
              </div>
              {canEdit && (
                <Button variant="ghost" size="sm" onClick={() => del.mutate(a.id)}>
                  <Trash2 size={14} />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {formOpen && <BankAccountForm contactId={contactId} onClose={() => setFormOpen(false)} />}
    </div>
  )
}

function BankAccountForm({ contactId, onClose }: { contactId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useUIStore((s) => s.toast)
  const [form, setForm] = useState<BankAccountInput>({
    cbu: '',
    alias: '',
    bank_name: '',
    account_holder: '',
    currency: 'ARS',
  })

  const mutation = useMutation({
    mutationFn: (body: BankAccountInput) => contactsApi.bankAccounts.create(contactId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact', contactId, 'bank-accounts'] })
      toast.success('Cuenta agregada')
      onClose()
    },
    onError: () => toast.error('No se pudo guardar'),
  })

  return (
    <SlideOver open onClose={onClose} title="Agregar cuenta bancaria">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!form.cbu.trim()) return
          mutation.mutate(form)
        }}
      >
        <Input label="CBU" value={form.cbu} onChange={(e) => setForm({ ...form, cbu: e.target.value })} required />
        <Input label="Alias" value={form.alias ?? ''} onChange={(e) => setForm({ ...form, alias: e.target.value })} />
        <Input label="Banco" value={form.bank_name ?? ''} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} />
        <Input
          label="Titular"
          value={form.account_holder ?? ''}
          onChange={(e) => setForm({ ...form, account_holder: e.target.value })}
        />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text">Moneda</label>
          <select
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}
            className="h-10 w-full rounded border border-border bg-surface px-3 text-base text-text"
          >
            {currencyOptions.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" size="md" loading={mutation.isPending}>
            Guardar
          </Button>
        </div>
      </form>
    </SlideOver>
  )
}

// ---------------- Notes ----------------

function NotesTab({ contactId, canEdit }: { contactId: string; canEdit: boolean }) {
  const qc = useQueryClient()
  const toast = useUIStore((s) => s.toast)
  const [body, setBody] = useState('')

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['contact', contactId, 'notes'],
    queryFn: () => contactsApi.notes.list(contactId),
  })

  const add = useMutation({
    mutationFn: (text: string) => contactsApi.notes.create(contactId, text),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact', contactId, 'notes'] })
      setBody('')
      toast.success('Nota agregada')
    },
    onError: () => toast.error('No se pudo guardar la nota'),
  })

  if (isLoading) return <Skeleton className="h-24 w-full" />
  if (isError) return <ErrorState onRetry={() => refetch()} />

  const notes = [...(data ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="space-y-2 rounded-xl border border-border bg-surface p-4">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Escribí una nota sobre este contacto…"
            rows={3}
            className="w-full rounded border border-border bg-surface p-3 text-base text-text placeholder:text-text-tertiary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
          <div className="flex justify-end">
            <Button
              variant="primary"
              size="md"
              loading={add.isPending}
              disabled={!body.trim()}
              onClick={() => add.mutate(body.trim())}
            >
              Agregar nota
            </Button>
          </div>
        </div>
      )}
      {notes.length === 0 ? (
        <EmptyState title="Sin notas" description="Agregá una nota sobre este contacto." />
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-xl border border-border bg-surface p-4">
              <p className="whitespace-pre-wrap text-sm text-text">{n.body}</p>
              <p className="mt-2 text-xs text-text-tertiary" title={formatDate(n.created_at)}>
                {formatRelativeTime(n.created_at)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------- Timeline ----------------

const timelineMeta: Record<string, { color: string; icon: typeof FileText }> = {
  note: { color: 'text-text-secondary', icon: FileText },
  calendar_event: { color: 'text-blue-500', icon: Calendar },
  opportunity: { color: 'text-green-500', icon: TrendingUp },
  invoice_issued: { color: 'text-indigo-500', icon: FileText },
  receipt: { color: 'text-teal-500', icon: DollarSign },
}

function TimelineTab({ contactId }: { contactId: string }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['contact', contactId, 'timeline'],
    queryFn: () => contactsApi.timeline(contactId),
  })

  if (isLoading) return <Skeleton className="h-24 w-full" />
  if (isError) return <ErrorState onRetry={() => refetch()} />

  const entries = [...(data ?? [])].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  )

  if (entries.length === 0) {
    return <EmptyState title="Sin actividad" description="Las interacciones con este contacto van a aparecer acá." />
  }

  return (
    <ul className="space-y-3">
      {entries.map((e: TimelineEntry, i) => {
        const meta = timelineMeta[e.kind] ?? { color: 'text-text-secondary', icon: FileText }
        const Icon = meta.icon
        const label =
          (e.title as string) || (e.body as string) || (e.description as string) || e.kind
        return (
          <li key={i} className="flex gap-3 rounded-xl border border-border bg-surface p-4">
            <div className={cn('mt-0.5', meta.color)}>
              <Icon size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-text">{label}</p>
              <p className="text-xs text-text-tertiary" title={formatDate(e.timestamp)}>
                {formatRelativeTime(e.timestamp)}
              </p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
