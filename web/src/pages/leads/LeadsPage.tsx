import { useState, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core'
import { useDraggable } from '@dnd-kit/core'
import {
  LayoutList,
  Columns,
  Plus,
  Globe,
  Mail,
  Phone,
  Linkedin,
  Twitter,
  Instagram,
  ExternalLink,
  ChevronRight,
  Youtube,
  MessageCircle,
} from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { SlideOver } from '../../components/ui/SlideOver'
import { Skeleton } from '../../components/ui/Skeleton'
import { ErrorState } from '../../components/ui/ErrorState'
import { EmptyState } from '../../components/ui/EmptyState'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { ConfirmModal } from '../../components/ui/Modal'
import { useUIStore } from '../../stores/ui'
import { useAuthStore } from '../../stores/auth'
import { leadsApi, type Lead, type LeadStatus, type CreateLeadInput, type LeadActivity } from '../../lib/api/leads'
import { MetricsSection } from './MetricsSection'

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'Nuevo',
  contacted: 'Contactado',
  following: 'En seguimiento',
  qualified: 'Calificado',
  converted: 'Convertido',
  rejected: 'Rechazado',
  waiting: 'En espera',
}

const STATUS_COLOR: Record<LeadStatus, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  new: 'neutral',
  contacted: 'info',
  following: 'info',
  qualified: 'warning',
  converted: 'success',
  rejected: 'danger',
  waiting: 'neutral',
}

const KANBAN_COLUMNS: LeadStatus[] = ['new', 'contacted', 'following', 'qualified', 'waiting']

const INDUSTRY_OPTIONS = [
  { value: '', label: 'Todas las industrias' },
  { value: 'tecnología', label: 'Tecnología' },
  { value: 'retail', label: 'Retail' },
  { value: 'servicios', label: 'Servicios' },
  { value: 'industria', label: 'Industria' },
  { value: 'agro', label: 'Agro' },
  { value: 'salud', label: 'Salud' },
  { value: 'educación', label: 'Educación' },
  { value: 'otro', label: 'Otro' },
]

const SOCIAL_ICONS: Record<string, typeof Linkedin> = {
  linkedin: Linkedin,
  twitter: Twitter,
  instagram: Instagram,
  youtube: Youtube,
  whatsapp: MessageCircle,
}

// ─── Lead form schema ─────────────────────────────────────────────────────────

const leadSchema = z.object({
  company_name: z.string().min(1, 'Requerido'),
  what_they_do: z.string().optional(),
  website: z.string().optional(),
  industry: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  approximate_size: z.string().optional(),
  follow_up_date: z.string().optional(),
})
type LeadFormValues = z.infer<typeof leadSchema>

const statusSchema = z.object({
  status: z.string().min(1),
  rejection_reason: z.string().optional(),
  follow_up_date: z.string().optional(),
})
type StatusFormValues = z.infer<typeof statusSchema>

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ContactChips({ lead }: { lead: Lead }) {
  const emails = lead.emails ?? []
  const phones = lead.phones ?? []
  if (emails.length === 0 && phones.length === 0) return <span className="text-text-tertiary text-xs">—</span>
  return (
    <div className="flex items-center gap-2">
      {emails.length > 0 && (
        <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
          <Mail className="w-3.5 h-3.5" />
          {emails.length}
        </span>
      )}
      {phones.length > 0 && (
        <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
          <Phone className="w-3.5 h-3.5" />
          {phones.length}
        </span>
      )}
    </div>
  )
}

// ─── DnD Kanban ───────────────────────────────────────────────────────────────

function KanbanCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id })
  const style = transform
    ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)`, opacity: isDragging ? 0.4 : 1 }
    : undefined
  const emails = lead.emails ?? []
  const phones = lead.phones ?? []
  const hasContact = emails.length > 0 || phones.length > 0

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className="rounded-xl border border-border bg-surface p-3 cursor-grab active:cursor-grabbing hover:border-brand/40 transition-colors shadow-sm select-none"
    >
      <p className="font-medium text-sm text-text truncate">{lead.company_name}</p>
      {lead.website && (
        <p className="text-xs text-text-tertiary mt-0.5 truncate">{lead.website.replace(/^https?:\/\//, '')}</p>
      )}
      {lead.what_they_do && (
        <p className="text-xs text-text-secondary mt-1 line-clamp-2">{lead.what_they_do}</p>
      )}
      {hasContact && (
        <div className="flex gap-3 mt-2 pt-2 border-t border-border/50">
          {emails.length > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-text-tertiary">
              <Mail className="w-3 h-3" /> {emails.length}
            </span>
          )}
          {phones.length > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-text-tertiary">
              <Phone className="w-3 h-3" /> {phones.length}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function KanbanColumn({
  status,
  leads,
  onCardClick,
}: {
  status: LeadStatus
  leads: Lead[]
  onCardClick: (lead: Lead) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col gap-2 w-[240px] flex-shrink-0 rounded-xl border p-3 transition-colors h-full overflow-y-auto ${
        isOver ? 'border-brand/50 bg-brand/5' : 'border-border bg-surface-subtle'
      }`}
    >
      <div className="flex items-center justify-between mb-1 sticky top-0 bg-inherit py-0.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
          {STATUS_LABELS[status]}
        </span>
        <span className="text-xs bg-surface-raised border border-border px-1.5 py-0.5 rounded-md text-text-tertiary">
          {leads.length}
        </span>
      </div>
      {leads.map((l) => (
        <KanbanCard key={l.id} lead={l} onClick={() => onCardClick(l)} />
      ))}
      {leads.length === 0 && (
        <div className="text-center text-xs text-text-tertiary py-6">Sin leads</div>
      )}
    </div>
  )
}

// ─── Lead Detail SlideOver ────────────────────────────────────────────────────

function LeadDetail({
  lead,
  onClose,
  onUpdate,
}: {
  lead: Lead
  onClose: () => void
  onUpdate: () => void
}) {
  const toast = useUIStore((s) => s.toast)
  const qc = useQueryClient()
  const [showStatusForm, setShowStatusForm] = useState(false)
  const [confirmConvert, setConfirmConvert] = useState(false)
  const [confirmReject, setConfirmReject] = useState(false)
  const [rejectReason] = useState('')

  const { data: activities, isLoading: loadingActs } = useQuery({
    queryKey: ['lead-activities', lead.id],
    queryFn: () => leadsApi.leads.activities(lead.id),
  })

  const changeStatus = useMutation({
    mutationFn: (v: StatusFormValues) =>
      leadsApi.leads.changeStatus(lead.id, v.status, v.rejection_reason),
    onSuccess: () => {
      toast.success('Estado actualizado')
      qc.invalidateQueries({ queryKey: ['leads'] })
      onUpdate()
      setShowStatusForm(false)
    },
    onError: (err: unknown) => {
      const msg = (err as { message?: string })?.message ?? 'Transición inválida'
      toast.error(msg)
    },
  })

  const convertLead = useMutation({
    mutationFn: () => leadsApi.leads.convert(lead.id),
    onSuccess: (res) => {
      toast.success(`Lead convertido. Contacto creado: ${res.contact_id}`)
      qc.invalidateQueries({ queryKey: ['leads'] })
      onUpdate()
      onClose()
    },
    onError: (err: unknown) => {
      const msg = (err as { message?: string })?.message ?? 'No se pudo convertir'
      toast.error(msg)
    },
  })

  const markWaiting = useMutation({
    mutationFn: () => leadsApi.leads.changeStatus(lead.id, 'waiting'),
    onSuccess: () => {
      toast.success('Lead en espera')
      qc.invalidateQueries({ queryKey: ['leads'] })
      onUpdate()
    },
    onError: (err: unknown) => toast.error((err as { message?: string })?.message ?? 'Error'),
  })

  const isTerminal = lead.status === 'converted' || lead.status === 'rejected'
  const canConvert = lead.status === 'qualified'

  const emails = lead.emails ?? []
  const phones = lead.phones ?? []
  const socials = lead.socials ?? []

  return (
    <SlideOver open onClose={onClose} title={lead.company_name} size="lg">
      <div className="flex flex-col gap-5">
        {/* Status + meta */}
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge label={STATUS_LABELS[lead.status]} color={STATUS_COLOR[lead.status]} />
          {lead.industry && (
            <span className="text-xs border border-border px-2 py-0.5 rounded-full text-text-secondary">
              {lead.industry}
            </span>
          )}
          {lead.city && (
            <span className="text-xs text-text-tertiary">
              {lead.city}{lead.country ? `, ${lead.country}` : ''}
            </span>
          )}
        </div>

        {/* Website */}
        {lead.website && (
          <a
            href={lead.website}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-sm text-brand hover:underline"
          >
            <ExternalLink className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{lead.website}</span>
          </a>
        )}

        {/* Description */}
        {lead.what_they_do && (
          <div className="rounded-lg bg-surface-subtle border border-border p-3">
            <p className="text-xs font-medium text-text-secondary mb-1">Qué hacen</p>
            <p className="text-sm text-text">{lead.what_they_do}</p>
          </div>
        )}

        {/* Emails */}
        {emails.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-2">
              Emails ({emails.length})
            </p>
            <div className="flex flex-col gap-1.5">
              {emails.map((e) => (
                <div key={e.id} className="flex items-center gap-2 rounded-lg bg-surface-subtle border border-border px-3 py-2">
                  <Mail className="w-4 h-4 text-text-tertiary flex-shrink-0" />
                  <a href={`mailto:${e.email}`} className="text-sm text-brand hover:underline flex-1 min-w-0 truncate">
                    {e.email}
                  </a>
                  {e.context && (
                    <span className="text-xs text-text-tertiary flex-shrink-0">({e.context})</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Phones */}
        {phones.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-2">
              Teléfonos ({phones.length})
            </p>
            <div className="flex flex-col gap-1.5">
              {phones.map((p) => (
                <div key={p.id} className="flex items-center gap-2 rounded-lg bg-surface-subtle border border-border px-3 py-2">
                  <Phone className="w-4 h-4 text-text-tertiary flex-shrink-0" />
                  <a href={`tel:${p.phone}`} className="text-sm text-text flex-1">
                    {p.phone}
                  </a>
                  {p.type && p.type !== 'unknown' && (
                    <span className="text-xs text-text-tertiary flex-shrink-0 capitalize">{p.type}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Socials */}
        {socials.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-2">
              Redes sociales ({socials.length})
            </p>
            <div className="flex flex-col gap-1.5">
              {socials.map((s) => {
                const Icon = SOCIAL_ICONS[s.platform.toLowerCase()] ?? Globe
                return (
                  <div key={s.id} className="flex items-center gap-2 rounded-lg bg-surface-subtle border border-border px-3 py-2">
                    <Icon className="w-4 h-4 text-text-tertiary flex-shrink-0" />
                    <span className="text-xs text-text-tertiary capitalize w-20 flex-shrink-0">{s.platform}</span>
                    {s.url ? (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-brand hover:underline flex-1 min-w-0 truncate"
                      >
                        {s.handle ?? s.url}
                      </a>
                    ) : (
                      <span className="text-sm text-text">{s.handle}</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Empty state if no contact data */}
        {emails.length === 0 && phones.length === 0 && socials.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-4 text-center">
            <p className="text-sm text-text-tertiary">Sin datos de contacto</p>
          </div>
        )}

        {/* Actions */}
        {!isTerminal && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Acciones</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowStatusForm(true)}>
                Cambiar estado
              </Button>
              {canConvert && (
                <Button variant="primary" size="sm" onClick={() => setConfirmConvert(true)}>
                  Convertir a cliente
                </Button>
              )}
              {lead.status !== 'waiting' && (
                <Button variant="secondary" size="sm" loading={markWaiting.isPending} onClick={() => markWaiting.mutate()}>
                  Poner en espera
                </Button>
              )}
              {lead.status !== 'rejected' && (
                <Button variant="danger" size="sm" onClick={() => setConfirmReject(true)}>
                  Rechazar
                </Button>
              )}
            </div>
          </div>
        )}

        {showStatusForm && (
          <StatusChangeForm
            lead={lead}
            onClose={() => setShowStatusForm(false)}
            onSave={(v) => changeStatus.mutate(v)}
            isLoading={changeStatus.isPending}
          />
        )}

        {/* Activity timeline */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-3">Actividad</p>
          {loadingActs ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <div className="flex flex-col gap-1 border-l-2 border-border pl-3">
              {(activities ?? []).length === 0 && (
                <p className="text-xs text-text-tertiary">Sin actividad registrada</p>
              )}
              {(activities ?? []).map((a) => (
                <ActivityItem key={a.id} activity={a} />
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirmConvert}
        title="Convertir a cliente"
        description={`¿Convertir "${lead.company_name}" a contacto cliente? Se creará automáticamente en el CRM.`}
        confirmLabel="Convertir"
        variant="primary"
        onConfirm={() => { setConfirmConvert(false); convertLead.mutate() }}
        onClose={() => setConfirmConvert(false)}
      />

      <ConfirmModal
        open={confirmReject}
        title="Rechazar lead"
        message={`¿Rechazar "${lead.company_name}"? Podés reactivarlo después cambiando el estado a Nuevo. Motivo: ${rejectReason || '—'}`}
        confirmLabel="Rechazar"
        variant="danger"
        onConfirm={() => {
          setConfirmReject(false)
          changeStatus.mutate({ status: 'rejected', rejection_reason: rejectReason || undefined })
        }}
        onClose={() => setConfirmReject(false)}
      />
    </SlideOver>
  )
}

function ActivityItem({ activity }: { activity: LeadActivity }) {
  const typeLabel: Record<string, string> = {
    created: 'Lead creado',
    status_changed: 'Estado cambiado',
    assigned: 'Asignado',
    note: 'Nota',
    converted: 'Convertido',
  }
  return (
    <div className="py-1.5">
      <p className="text-xs font-medium text-text">{typeLabel[activity.activity_type] ?? activity.activity_type}</p>
      {activity.detail && <p className="text-xs text-text-secondary mt-0.5">{activity.detail}</p>}
      <p className="text-xs text-text-tertiary mt-0.5">
        {new Date(activity.created_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
      </p>
    </div>
  )
}

function StatusChangeForm({
  lead,
  onClose,
  onSave,
  isLoading,
}: {
  lead: Lead
  onClose: () => void
  onSave: (v: StatusFormValues) => void
  isLoading: boolean
}) {
  const STATUS_OPTIONS: { value: string; label: string }[] = [
    { value: 'new', label: 'Nuevo' },
    { value: 'contacted', label: 'Contactado' },
    { value: 'following', label: 'En seguimiento' },
    { value: 'qualified', label: 'Calificado' },
    { value: 'waiting', label: 'En espera' },
    { value: 'rejected', label: 'Rechazado' },
  ].filter((o) => o.value !== lead.status)

  const { register, handleSubmit, watch } = useForm<StatusFormValues>({
    resolver: zodResolver(statusSchema),
    defaultValues: { status: STATUS_OPTIONS[0]?.value ?? '' },
  })
  const status = watch('status')

  return (
    <form
      onSubmit={handleSubmit(onSave)}
      className="border border-border rounded-xl p-4 flex flex-col gap-3 bg-surface-subtle"
    >
      <p className="text-sm font-medium text-text">Cambiar estado</p>
      <Select label="Nuevo estado" {...register('status')} options={STATUS_OPTIONS} />
      {status === 'rejected' && (
        <Input label="Motivo de rechazo" {...register('rejection_reason')} placeholder="Opcional" />
      )}
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
        <Button type="submit" variant="primary" size="sm" loading={isLoading}>Guardar</Button>
      </div>
    </form>
  )
}

// ─── Lead create form ─────────────────────────────────────────────────────────

function LeadForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useUIStore((s) => s.toast)
  const { register, handleSubmit, formState: { errors } } = useForm<LeadFormValues>({
    resolver: zodResolver(leadSchema),
  })

  const save = useMutation({
    mutationFn: (data: LeadFormValues) => leadsApi.leads.create(data as CreateLeadInput),
    onSuccess: () => { toast.success('Lead creado'); onSaved() },
    onError: () => toast.error('No se pudo crear el lead'),
  })

  return (
    <SlideOver open onClose={onClose} title="Nuevo lead">
      <form onSubmit={handleSubmit((d) => save.mutate(d))} className="flex flex-col gap-4">
        <Input label="Empresa *" {...register('company_name')} error={errors.company_name?.message} />
        <Input label="¿Qué hacen?" {...register('what_they_do')} placeholder="Descripción corta" />
        <Input label="Sitio web" {...register('website')} placeholder="https://..." />
        <Select label="Industria" {...register('industry')} options={INDUSTRY_OPTIONS} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Ciudad" {...register('city')} />
          <Input label="País" {...register('country')} />
        </div>
        <Input label="Fecha de seguimiento" type="date" {...register('follow_up_date')} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" size="md" loading={save.isPending}>Crear lead</Button>
        </div>
      </form>
    </SlideOver>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function LeadsPage() {
  const can = useAuthStore((s) => s.can)
  const qc = useQueryClient()
  const toast = useUIStore((s) => s.toast)

  const [view, setView] = useState<'table' | 'kanban'>('table')
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [activeDragLead, setActiveDragLead] = useState<Lead | null>(null)

  const [filterStatus, setFilterStatus] = useState('')
  const [filterIndustry, setFilterIndustry] = useState('')

  const { data: leads, isLoading, isError, refetch } = useQuery({
    queryKey: ['leads', { status: filterStatus, industry: filterIndustry }],
    queryFn: () => leadsApi.leads.list({
      status: filterStatus || undefined,
      industry: filterIndustry || undefined,
    }),
  })

  const changeStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      leadsApi.leads.changeStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] })
    },
    onError: (err: unknown) => {
      const msg = (err as { message?: string })?.message ?? 'Transición no permitida'
      toast.error(msg)
    },
  })

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const lead = leads?.find((l) => l.id === event.active.id)
      setActiveDragLead(lead ?? null)
    },
    [leads],
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragLead(null)
      const { active, over } = event
      if (!over) return
      const newStatus = over.id as LeadStatus
      const lead = leads?.find((l) => l.id === active.id)
      if (!lead || lead.status === newStatus) return
      changeStatus.mutate({ id: lead.id, status: newStatus })
    },
    [leads, changeStatus],
  )

  const grouped = (leads ?? []).reduce<Record<string, Lead[]>>((acc, l) => {
    ;(acc[l.status] ??= []).push(l)
    return acc
  }, {})

  if (!can('leads', 'view')) {
    return (
      <div className="p-6">
        <p className="text-text-secondary">Sin permiso para ver leads.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 h-full min-h-0">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
        <h1 className="text-2xl font-semibold text-text">Leads</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView('table')}
            title="Vista lista"
            className={`p-2 rounded-lg border transition-colors ${
              view === 'table'
                ? 'border-brand bg-brand/10 text-brand'
                : 'border-border text-text-secondary hover:text-text'
            }`}
          >
            <LayoutList className="w-4 h-4" />
          </button>
          <button
            onClick={() => setView('kanban')}
            title="Vista kanban"
            className={`p-2 rounded-lg border transition-colors ${
              view === 'kanban'
                ? 'border-brand bg-brand/10 text-brand'
                : 'border-border text-text-secondary hover:text-text'
            }`}
          >
            <Columns className="w-4 h-4" />
          </button>
          {can('leads', 'create') && (
            <Button variant="primary" size="md" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-1" /> Nuevo lead
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 flex-shrink-0">
        <div className="w-44">
          <Select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            options={[
              { value: '', label: 'Todos los estados' },
              ...Object.entries(STATUS_LABELS).map(([v, l]) => ({ value: v, label: l })),
            ]}
          />
        </div>
        <div className="w-44">
          <Select
            value={filterIndustry}
            onChange={(e) => setFilterIndustry(e.target.value)}
            options={INDUSTRY_OPTIONS}
          />
        </div>
      </div>

      {/* Content — flex-1 min-h-0 so it fills remaining space without overflow */}
      <div className="flex-1 min-h-0 flex flex-col">
        {isLoading ? (
          <div className="flex gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-64 w-56" />)}
          </div>
        ) : isError ? (
          <ErrorState message="No se pudieron cargar los leads." onRetry={() => refetch()} />
        ) : (leads ?? []).length === 0 ? (
          <EmptyState
            title="Sin leads todavía"
            description="Creá uno manualmente o lanzá un scraping para encontrar prospectos."
            action={can('leads', 'create') ? { label: 'Nuevo lead', onClick: () => setShowCreate(true) } : undefined}
          />
        ) : view === 'kanban' ? (
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="flex gap-4 overflow-x-auto pb-2 flex-1 min-h-0">
              {KANBAN_COLUMNS.map((col) => (
                <KanbanColumn
                  key={col}
                  status={col}
                  leads={grouped[col] ?? []}
                  onCardClick={setSelectedLead}
                />
              ))}
            </div>
            <DragOverlay>
              {activeDragLead && (
                <div className="rounded-xl border border-brand bg-surface p-3 shadow-lg w-56 opacity-90">
                  <p className="font-medium text-sm text-text">{activeDragLead.company_name}</p>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        ) : (
          /* Table — scrollable, fills full remaining height */
          <div className="rounded-xl border border-border bg-surface overflow-hidden flex flex-col flex-1 min-h-0">
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-sm">
                <thead className="bg-surface-subtle border-b border-border sticky top-0 z-10">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">
                      Empresa
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">
                      Sitio web
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">
                      Contacto
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">
                      Estado
                    </th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(leads ?? []).map((lead) => (
                    <tr
                      key={lead.id}
                      onClick={() => setSelectedLead(lead)}
                      className="hover:bg-surface-subtle cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-text max-w-[200px]">
                        <span className="truncate block">{lead.company_name}</span>
                        {lead.what_they_do && (
                          <span className="text-xs text-text-tertiary truncate block mt-0.5">
                            {lead.what_they_do}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-secondary max-w-[180px]">
                        {lead.website ? (
                          <span className="text-xs truncate block text-text-secondary">
                            {lead.website.replace(/^https?:\/\//, '')}
                          </span>
                        ) : (
                          <span className="text-text-tertiary">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <ContactChips lead={lead} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge label={STATUS_LABELS[lead.status]} color={STATUS_COLOR[lead.status]} />
                      </td>
                      <td className="px-4 py-3">
                        <ChevronRight className="w-4 h-4 text-text-tertiary" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Metrics — always below, never competing for content height */}
      <div className="flex-shrink-0">
        <MetricsSection />
      </div>

      {/* Modals */}
      {showCreate && (
        <LeadForm
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false)
            qc.invalidateQueries({ queryKey: ['leads'] })
          }}
        />
      )}
      {selectedLead && (
        <LeadDetail
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onUpdate={() => {
            qc.invalidateQueries({ queryKey: ['leads'] })
            setSelectedLead(null)
          }}
        />
      )}
    </div>
  )
}
