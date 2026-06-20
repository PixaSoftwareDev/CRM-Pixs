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
  Download,
  Paperclip,
  AlertTriangle,
  CheckCircle2,
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
import { formatRelativeTime, formatDate, formatMoney, cn } from '../../lib/utils'
import {
  contactsApi,
  tagsApi,
  type ContactPerson,
  type ContactTag,
  type PersonInput,
  type BankAccountInput,
  type TimelineEntry,
} from '../../lib/api/contacts'
import { financeApi } from '../../lib/api/finance'
import { documentsApi } from '../../lib/api/documents'
import {
  contactKindColor,
  contactKindLabel,
  lifecycleColor,
  lifecycleLabel,
  currencyOptions,
} from '../../lib/crm'
import { ContactForm } from './ContactForm'
import { ProjectForm } from '../projects/ProjectForm'
import { TaskForm } from '../tasks/TaskForm'
import { projectsApi } from '../../lib/api/projects'
import { opportunitiesApi, pipelineApi } from '../../lib/api/sales'

const VAT_CONDITION_LABELS: Record<string, string> = {
  ri: 'Responsable Inscripto',
  monotributo: 'Monotributista',
  exempt: 'Exento',
  final_consumer: 'Consumidor Final',
}

type Tab = 'personas' | 'financiero' | 'comentarios' | 'documentos' | 'cuentas' | 'notas' | 'timeline' | 'etiquetas'

export function ContactDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const can = useAuthStore((s) => s.can)
  const toast = useUIStore((s) => s.toast)
  const [tab, setTab] = useState<Tab>('personas')
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [newTaskOpen, setNewTaskOpen] = useState(false)

  const projectsQ = useQuery({ queryKey: ['projects'], queryFn: () => projectsApi.list() })
  const oppsQ = useQuery({
    queryKey: ['opportunities', { contact_id: id }],
    queryFn: () => opportunitiesApi.list({ contact_id: id }),
    enabled: !!id,
  })
  const stagesQ = useQuery({ queryKey: ['pipeline-stages'], queryFn: () => pipelineApi.stages() })
  const contactOpp = oppsQ.data?.[0] ?? null
  const contactStage = stagesQ.data?.find((s) => s.id === contactOpp?.stage_id) ?? null

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

  const isClient = contact.kind.includes('client')
  const tabs: { key: Tab; label: string }[] = [
    { key: 'personas', label: 'Personas' },
    ...(isClient ? [{ key: 'financiero' as Tab, label: 'Situación financiera' }] : []),
    { key: 'comentarios', label: 'Comentarios' },
    { key: 'documentos', label: 'Documentos' },
    { key: 'cuentas', label: 'Cuentas bancarias' },
    { key: 'notas', label: 'Notas' },
    { key: 'timeline', label: 'Timeline' },
    { key: 'etiquetas', label: 'Etiquetas' },
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
            {contactStage && (
              <button
                onClick={() => navigate('/ventas/pipeline')}
                className="flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand hover:bg-brand/20 transition-colors"
              >
                <TrendingUp size={11} />
                Pipeline: {contactStage.name}
              </button>
            )}
            {contact.kind.includes('client') && <DebtBadge contactId={id} onClick={() => setTab('financiero')} />}
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

      {/* Acciones rápidas */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate('/ventas/presupuestos/nuevo', { state: { contact_id: id } })}
        >
          <FileText size={15} /> Nuevo presupuesto
        </Button>
        {contactOpp ? (
          <Button variant="secondary" size="sm" onClick={() => navigate('/ventas/pipeline')}>
            <TrendingUp size={15} /> Ver en pipeline
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              const stages = await pipelineApi.stages()
              if (!stages[0]) return
              await opportunitiesApi.create({
                contact_id: id,
                stage_id: stages[0].id,
                title: contact.fantasy_name || contact.legal_name || 'Sin nombre',
                currency: 'ARS',
              })
              oppsQ.refetch()
              navigate('/ventas/pipeline')
            }}
          >
            <TrendingUp size={15} /> Agregar al pipeline
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={() => setNewProjectOpen(true)}>
          <Plus size={15} /> Nuevo proyecto
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setNewTaskOpen(true)}>
          <Plus size={15} /> Nueva tarea
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-surface p-5 sm:grid-cols-3">
        <Field label="CUIT/CUIL" value={contact.cuit_cuil} />
        <Field label="Condición IVA" value={VAT_CONDITION_LABELS[contact.vat_condition ?? ''] ?? contact.vat_condition} />
        <Field label="Rubro" value={contact.industry} />
        <Field label="Localidad" value={[contact.city, contact.province].filter(Boolean).join(', ')} />
        <Field label="Domicilio" value={[contact.fiscal_address, contact.postal_code].filter(Boolean).join(' · ')} />
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
      {tab === 'financiero' && <FinancialTab contactId={id} />}
      {tab === 'comentarios' && <CommentsTab contactId={id} canEdit={canEdit} />}
      {tab === 'documentos' && <DocumentsTab contactId={id} canEdit={canEdit} />}
      {tab === 'cuentas' && <BankAccountsTab contactId={id} canEdit={canEdit} />}
      {tab === 'notas' && <NotesTab contactId={id} canEdit={canEdit} />}
      {tab === 'timeline' && <TimelineTab contactId={id} />}
      {tab === 'etiquetas' && <TagsTab contactId={id} canEdit={canEdit} />}

      {editOpen && <ContactForm open={editOpen} onClose={() => setEditOpen(false)} contact={contact} />}
      {newProjectOpen && (
        <ProjectForm
          open={newProjectOpen}
          onClose={() => setNewProjectOpen(false)}
          initialClientId={id}
        />
      )}
      {newTaskOpen && (
        <TaskForm
          open={newTaskOpen}
          onClose={() => setNewTaskOpen(false)}
          projects={projectsQ.data ?? []}
        />
      )}
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
          const clean = (v?: string) => (v && v.trim() ? v.trim() : undefined)
          mutation.mutate({
            name: form.name.trim(),
            role: clean(form.role),
            email: clean(form.email),
            phone: clean(form.phone),
            notes: clean(form.notes),
            birthday: clean(form.birthday),
            is_primary: form.is_primary,
          })
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
                <p className="font-mono text-sm text-text">{a.cbu_display}</p>
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

// ---------------- Situación financiera ----------------

function DebtBadge({ contactId, onClick }: { contactId: string; onClick: () => void }) {
  const { data } = useQuery({
    queryKey: ['contact', contactId, 'statement', 'ARS'],
    queryFn: () => financeApi.accountStatement(contactId, 'ARS'),
  })
  if (!data) return null
  const balance = parseFloat(data.balance || '0')
  const owes = balance > 0.009
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
        owes
          ? 'border-danger/30 bg-danger/10 text-danger hover:bg-danger/20'
          : 'border-success/30 bg-success/10 text-success hover:bg-success/20',
      )}
      title="Ver situación financiera"
    >
      {owes ? <AlertTriangle size={11} /> : <CheckCircle2 size={11} />}
      {owes ? `Debe ${formatMoney(data.balance, 'ARS')}` : 'Al día'}
    </button>
  )
}

function FinancialTab({ contactId }: { contactId: string }) {
  const [currency, setCurrency] = useState('ARS')
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['contact', contactId, 'statement', currency],
    queryFn: () => financeApi.accountStatement(contactId, currency),
  })

  if (isLoading) return <Skeleton className="h-40 w-full" />
  if (isError) return <ErrorState onRetry={() => refetch()} />
  if (!data) return null

  const balance = parseFloat(data.balance || '0')
  const owes = balance > 0.009
  const aging = data.aging
  const buckets = [
    { label: 'Por vencer', value: aging.Current },
    { label: '0–30 días', value: aging.Bucket30 },
    { label: '31–60 días', value: aging.Bucket60 },
    { label: '61–90 días', value: aging.Bucket90 },
    { label: '+90 días', value: aging.Bucket90P },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="rounded border border-border bg-surface px-2 py-1 text-sm text-text focus:border-brand focus:outline-none"
        >
          {currencyOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Saldo */}
      <div className={cn(
        'rounded-xl border p-5',
        owes ? 'border-danger/30 bg-danger/5' : 'border-success/30 bg-success/5',
      )}>
        <p className="text-xs text-text-tertiary">Saldo de cuenta corriente</p>
        <p className={cn('text-2xl font-semibold', owes ? 'text-danger' : 'text-success')}>
          {formatMoney(data.balance, currency)}
        </p>
        <p className="mt-1 text-sm text-text-secondary">
          {owes ? 'El cliente tiene deuda pendiente.' : 'El cliente está al día.'}
        </p>
      </div>

      {/* Aging */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {buckets.map((b) => (
          <div key={b.label} className="rounded-lg border border-border bg-surface p-3">
            <p className="text-xs text-text-tertiary">{b.label}</p>
            <p className="text-sm font-medium text-text">{formatMoney(b.value, currency)}</p>
          </div>
        ))}
      </div>

      {/* Movimientos */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-subtle text-left text-xs text-text-tertiary">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Concepto</th>
              <th className="px-3 py-2 text-right">Debe</th>
              <th className="px-3 py-2 text-right">Haber</th>
              <th className="px-3 py-2 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-text-tertiary">Sin movimientos</td></tr>
            ) : (
              data.entries.map((e, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-3 py-2 text-text-secondary">{formatDate(e.date)}</td>
                  <td className="px-3 py-2 text-text">{e.reference}</td>
                  <td className="px-3 py-2 text-right text-text">{parseFloat(e.debit) ? formatMoney(e.debit, currency) : '—'}</td>
                  <td className="px-3 py-2 text-right text-text">{parseFloat(e.credit) ? formatMoney(e.credit, currency) : '—'}</td>
                  <td className="px-3 py-2 text-right font-medium text-text">{formatMoney(e.running_balance, currency)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------- Comentarios ----------------

function CommentsTab({ contactId, canEdit }: { contactId: string; canEdit: boolean }) {
  const qc = useQueryClient()
  const toast = useUIStore((s) => s.toast)
  const [body, setBody] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')

  const key = ['contact', contactId, 'comments']
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: key,
    queryFn: () => contactsApi.comments.list(contactId),
  })

  const add = useMutation({
    mutationFn: (text: string) => contactsApi.comments.create(contactId, text),
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); setBody(''); toast.success('Comentario agregado') },
    onError: () => toast.error('No se pudo guardar el comentario'),
  })
  const edit = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => contactsApi.comments.update(contactId, id, text),
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); setEditingId(null); toast.success('Comentario actualizado') },
    onError: () => toast.error('No se pudo actualizar'),
  })
  const del = useMutation({
    mutationFn: (id: string) => contactsApi.comments.delete(contactId, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success('Comentario eliminado') },
    onError: () => toast.error('No se pudo eliminar'),
  })

  if (isLoading) return <Skeleton className="h-24 w-full" />
  if (isError) return <ErrorState onRetry={() => refetch()} />

  const comments = data ?? []

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-xl border border-border bg-surface p-4">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Escribí un comentario…"
          rows={3}
          className="w-full rounded border border-border bg-surface p-3 text-base text-text placeholder:text-text-tertiary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
        <div className="flex justify-end">
          <Button variant="primary" size="md" loading={add.isPending} disabled={!body.trim()} onClick={() => add.mutate(body.trim())}>
            Agregar comentario
          </Button>
        </div>
      </div>
      {comments.length === 0 ? (
        <EmptyState title="Sin comentarios" description="Dejá un comentario sobre este cliente." />
      ) : (
        <ul className="space-y-2">
          {comments.map((c) => (
            <li key={c.id} className="rounded-xl border border-border bg-surface p-4">
              {editingId === c.id ? (
                <div className="space-y-2">
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={3}
                    className="w-full rounded border border-border bg-surface p-2 text-sm text-text focus:border-brand focus:outline-none"
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>Cancelar</Button>
                    <Button variant="primary" size="sm" loading={edit.isPending} disabled={!editBody.trim()}
                      onClick={() => edit.mutate({ id: c.id, text: editBody.trim() })}>Guardar</Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="whitespace-pre-wrap text-sm text-text">{c.body}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-xs text-text-tertiary" title={formatDate(c.created_at)}>
                      {formatRelativeTime(c.created_at)}
                    </p>
                    {canEdit && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => { setEditingId(c.id); setEditBody(c.body) }}>
                          <Pencil size={13} />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => del.mutate(c.id)}>
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------- Documentos ----------------

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function DocumentsTab({ contactId, canEdit }: { contactId: string; canEdit: boolean }) {
  const qc = useQueryClient()
  const toast = useUIStore((s) => s.toast)
  const key = ['contact', contactId, 'documents']

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: key,
    queryFn: () => documentsApi.list('contact', contactId),
  })

  const upload = useMutation({
    mutationFn: (file: File) => documentsApi.upload('contact', contactId, file),
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success('Documento subido') },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo subir el documento'),
  })
  const del = useMutation({
    mutationFn: (id: string) => documentsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success('Documento eliminado') },
    onError: () => toast.error('No se pudo eliminar'),
  })

  if (isLoading) return <Skeleton className="h-24 w-full" />
  if (isError) return <ErrorState onRetry={() => refetch()} />

  const docs = data ?? []

  return (
    <div className="space-y-4">
      {canEdit && (
        <label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary hover:border-brand hover:text-brand">
          <Paperclip size={16} />
          {upload.isPending ? 'Subiendo…' : 'Adjuntar documento'}
          <input
            type="file"
            className="hidden"
            disabled={upload.isPending}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) upload.mutate(f)
              e.target.value = ''
            }}
          />
        </label>
      )}
      {docs.length === 0 ? (
        <EmptyState title="Sin documentos" description="Adjuntá archivos relacionados a este contacto." />
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between rounded-xl border border-border bg-surface p-4">
              <div className="flex items-center gap-3 min-w-0">
                <FileText size={18} className="shrink-0 text-text-tertiary" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">{d.file_name}</p>
                  <p className="text-xs text-text-tertiary">
                    {formatBytes(d.size_bytes)} · {formatRelativeTime(d.created_at)}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <a href={documentsApi.downloadUrl(d.id)} target="_blank" rel="noreferrer"
                  className="rounded p-2 text-text-tertiary hover:bg-surface-subtle hover:text-text" title="Descargar">
                  <Download size={16} />
                </a>
                {canEdit && (
                  <Button variant="ghost" size="sm" onClick={() => del.mutate(d.id)}>
                    <Trash2 size={14} />
                  </Button>
                )}
              </div>
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

// ---------------- Tags ----------------

const TAG_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16',
]

function TagsTab({ contactId, canEdit }: { contactId: string; canEdit: boolean }) {
  const qc = useQueryClient()
  const toast = useUIStore((s) => s.toast)
  const [newTag, setNewTag] = useState('')
  const [creating, setCreating] = useState(false)

  const { data: assigned, isLoading } = useQuery({
    queryKey: ['contact', contactId, 'tags'],
    queryFn: () => contactsApi.tags.list(contactId),
  })

  const { data: allTags } = useQuery({
    queryKey: ['tags'],
    queryFn: () => tagsApi.list(),
  })

  const add = useMutation({
    mutationFn: (tagId: string) => contactsApi.tags.add(contactId, tagId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact', contactId, 'tags'] })
      toast.success('Etiqueta agregada')
    },
    onError: () => toast.error('No se pudo agregar la etiqueta'),
  })

  const remove = useMutation({
    mutationFn: (tagId: string) => contactsApi.tags.remove(contactId, tagId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact', contactId, 'tags'] })
      toast.success('Etiqueta quitada')
    },
    onError: () => toast.error('No se pudo quitar la etiqueta'),
  })

  const createAndAdd = useMutation({
    mutationFn: async (name: string) => {
      const color = TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]
      const tag = await tagsApi.create(name, color)
      await contactsApi.tags.add(contactId, tag.id)
      return tag
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact', contactId, 'tags'] })
      qc.invalidateQueries({ queryKey: ['tags'] })
      setNewTag('')
      setCreating(false)
      toast.success('Etiqueta creada y asignada')
    },
    onError: () => toast.error('No se pudo crear la etiqueta'),
  })

  if (isLoading) return <Skeleton className="h-24 w-full" />

  const assignedIds = new Set((assigned ?? []).map((t: ContactTag) => t.id))
  const unassigned = (allTags ?? []).filter((t: ContactTag) => !assignedIds.has(t.id))

  return (
    <div className="space-y-4">
      {/* Assigned tags */}
      <div>
        <p className="mb-2 text-sm font-medium text-text">Etiquetas asignadas</p>
        {(assigned ?? []).length === 0 ? (
          <p className="text-sm text-text-secondary">Sin etiquetas.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(assigned ?? []).map((t: ContactTag) => (
              <span
                key={t.id}
                className="flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium text-white"
                style={{ backgroundColor: t.color ?? '#6366f1' }}
              >
                {t.name}
                {canEdit && (
                  <button
                    onClick={() => remove.mutate(t.id)}
                    className="ml-0.5 opacity-70 hover:opacity-100 transition-opacity"
                    title="Quitar etiqueta"
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      {canEdit && (
        <>
          {/* Add existing tags */}
          {unassigned.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium text-text">Agregar etiqueta existente</p>
              <div className="flex flex-wrap gap-2">
                {unassigned.map((t: ContactTag) => (
                  <button
                    key={t.id}
                    onClick={() => add.mutate(t.id)}
                    className="flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1 text-sm font-medium transition-colors hover:opacity-80"
                    style={{ borderColor: t.color ?? '#6366f1', color: t.color ?? '#6366f1' }}
                  >
                    + {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Create new tag */}
          <div>
            {creating ? (
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newTag.trim()) createAndAdd.mutate(newTag.trim())
                    if (e.key === 'Escape') { setCreating(false); setNewTag('') }
                  }}
                  placeholder="Nombre de la etiqueta"
                  className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text placeholder:text-text-tertiary focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
                <Button
                  variant="primary"
                  size="sm"
                  loading={createAndAdd.isPending}
                  disabled={!newTag.trim()}
                  onClick={() => createAndAdd.mutate(newTag.trim())}
                >
                  Crear
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setCreating(false); setNewTag('') }}>
                  Cancelar
                </Button>
              </div>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setCreating(true)}>
                <Plus size={14} /> Nueva etiqueta
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
