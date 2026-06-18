import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, MoreVertical, TrendingUp } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { SlideOver } from '../../components/ui/SlideOver'
import { Modal } from '../../components/ui/Modal'
import { KPICard } from '../../components/ui/KPICard'
import { ErrorState } from '../../components/ui/ErrorState'
import { Skeleton } from '../../components/ui/Skeleton'
import { ContactPicker } from '../../components/ui/ContactPicker'
import { useAuthStore } from '../../stores/auth'
import { useUIStore } from '../../stores/ui'
import { formatMoney } from '../../lib/utils'
import { currencyOptions } from '../../lib/crm'
import {
  pipelineApi,
  opportunitiesApi,
  type Opportunity,
  type PipelineStage,
  type CreateOpportunityInput,
} from '../../lib/api/sales'
import { contactsApi } from '../../lib/api/contacts'

export function PipelinePage() {
  const qc = useQueryClient()
  const can = useAuthStore((s) => s.can)
  const toast = useUIStore((s) => s.toast)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Opportunity | null>(null)
  const [losing, setLosing] = useState<Opportunity | null>(null)

  const stagesQ = useQuery({ queryKey: ['pipeline-stages'], queryFn: () => pipelineApi.stages() })
  const oppsQ = useQuery({ queryKey: ['opportunities'], queryFn: () => opportunitiesApi.list() })
  const forecastQ = useQuery({ queryKey: ['pipeline-forecast'], queryFn: () => pipelineApi.forecast() })

  const move = useMutation({
    mutationFn: ({ id, stage_id }: { id: string; stage_id: string }) =>
      opportunitiesApi.move(id, stage_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['opportunities'] })
      qc.invalidateQueries({ queryKey: ['pipeline-forecast'] })
    },
    onError: () => {
      toast.error('No se pudo mover la oportunidad')
      qc.invalidateQueries({ queryKey: ['opportunities'] })
    },
  })

  const win = useMutation({
    mutationFn: (id: string) => opportunitiesApi.win(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['opportunities'] })
      qc.invalidateQueries({ queryKey: ['pipeline-forecast'] })
      toast.success('Oportunidad ganada')
    },
    onError: () => toast.error('No se pudo marcar como ganada'),
  })

  const stages = useMemo(
    () => [...(stagesQ.data ?? [])].sort((a, b) => a.order_pos - b.order_pos),
    [stagesQ.data],
  )
  const opps = oppsQ.data ?? []

  // Map droppable id (stage::<id>) or card id back to a stage.
  const cardStage = useMemo(() => {
    const m: Record<string, string> = {}
    opps.forEach((o) => (m[o.id] = o.stage_id))
    return m
  }, [opps])

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over) return
    const overId = String(over.id)
    const targetStage = overId.startsWith('stage::') ? overId.slice(7) : cardStage[overId]
    const oppId = String(active.id)
    if (!targetStage || cardStage[oppId] === targetStage) return
    move.mutate({ id: oppId, stage_id: targetStage })
  }

  if (stagesQ.isError || oppsQ.isError) {
    return (
      <div className="p-4 md:p-6">
        <ErrorState
          message="No pudimos cargar el pipeline."
          onRetry={() => {
            stagesQ.refetch()
            oppsQ.refetch()
          }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-text">Pipeline de ventas</h1>
        {can('opportunities', 'create') && (
          <Button
            variant="primary"
            size="lg"
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus size={20} />
            Nueva oportunidad
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:max-w-sm">
        <KPICard
          label="Pronóstico ponderado"
          value={formatMoney(forecastQ.data?.total_weighted ?? '0')}
          icon={<TrendingUp size={18} />}
          loading={forecastQ.isLoading}
        />
      </div>

      {stagesQ.isLoading || oppsQ.isLoading ? (
        <div className="flex gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-64 w-72" />
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {stages.map((stage) => (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                opportunities={opps.filter((o) => o.stage_id === stage.id)}
                canEdit={can('opportunities', 'edit') || can('opportunities', 'update')}
                onEdit={(o) => {
                  setEditing(o)
                  setFormOpen(true)
                }}
                onWin={(o) => win.mutate(o.id)}
                onLose={(o) => setLosing(o)}
              />
            ))}
          </div>
        </DndContext>
      )}

      {formOpen && (
        <OpportunityForm
          stages={stages}
          opportunity={editing}
          onClose={() => {
            setFormOpen(false)
            setEditing(null)
          }}
        />
      )}
      {losing && <LoseModal opportunity={losing} onClose={() => setLosing(null)} />}
    </div>
  )
}

function KanbanColumn({
  stage,
  opportunities,
  canEdit,
  onEdit,
  onWin,
  onLose,
}: {
  stage: PipelineStage
  opportunities: Opportunity[]
  canEdit: boolean
  onEdit: (o: Opportunity) => void
  onWin: (o: Opportunity) => void
  onLose: (o: Opportunity) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `stage::${stage.id}` })
  const total = opportunities.reduce((acc, o) => acc + parseFloat(o.amount ?? '0'), 0)

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-xl border border-border bg-surface-raised">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          {stage.color && (
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
          )}
          <span className="text-sm font-medium text-text">{stage.name}</span>
          <span className="rounded-full bg-surface px-1.5 text-xs text-text-secondary">
            {opportunities.length}
          </span>
        </div>
        <span className="text-xs text-text-secondary">{formatMoney(total)}</span>
      </div>
      <div
        ref={setNodeRef}
        className={
          'flex min-h-[120px] flex-1 flex-col gap-2 p-2 ' + (isOver ? 'bg-brand-light/40' : '')
        }
      >
        <SortableContext items={opportunities.map((o) => o.id)} strategy={verticalListSortingStrategy}>
          {opportunities.map((o) => (
            <OpportunityCard
              key={o.id}
              opportunity={o}
              canEdit={canEdit}
              onEdit={onEdit}
              onWin={onWin}
              onLose={onLose}
            />
          ))}
        </SortableContext>
        {opportunities.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-text-tertiary">Arrastrá para mover</p>
        )}
      </div>
    </div>
  )
}

function OpportunityCard({
  opportunity,
  canEdit,
  onEdit,
  onWin,
  onLose,
}: {
  opportunity: Opportunity
  canEdit: boolean
  onEdit: (o: Opportunity) => void
  onWin: (o: Opportunity) => void
  onLose: (o: Opportunity) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: opportunity.id,
  })
  const [menu, setMenu] = useState(false)
  const { data: contact } = useQuery({
    queryKey: ['contact', opportunity.contact_id],
    queryFn: () => contactsApi.get(opportunity.contact_id),
    enabled: !!opportunity.contact_id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative rounded-lg border border-border bg-surface p-3 shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div
          {...attributes}
          {...listeners}
          className="min-w-0 flex-1 cursor-grab active:cursor-grabbing"
        >
          <p className="truncate text-sm font-medium text-text">{opportunity.title}</p>
          {contact && <p className="truncate text-xs text-text-secondary">{contact.fantasy_name}</p>}
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            className="text-text-tertiary hover:text-text"
            aria-label="Acciones"
          >
            <MoreVertical size={16} />
          </button>
        )}
        {menu && (
          <div className="absolute right-2 top-8 z-20 w-40 rounded-lg border border-border bg-surface-overlay py-1 shadow-overlay">
            <MenuItem onClick={() => { setMenu(false); onEdit(opportunity) }}>Editar</MenuItem>
            <MenuItem onClick={() => { setMenu(false); onWin(opportunity) }}>Marcar ganada</MenuItem>
            <MenuItem onClick={() => { setMenu(false); onLose(opportunity) }}>Marcar perdida</MenuItem>
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-text">
          {formatMoney(opportunity.amount ?? '0', opportunity.currency)}
        </span>
        <div className="flex items-center gap-1.5">
          {opportunity.probability_pct != null && (
            <span className="rounded-full bg-surface-raised px-2 py-0.5 text-xs text-text-secondary">
              {opportunity.probability_pct}%
            </span>
          )}
          {opportunity.assigned_user_id && (
            <SellerAvatar userId={opportunity.assigned_user_id} />
          )}
        </div>
      </div>
    </div>
  )
}

function SellerAvatar({ userId }: { userId: string }) {
  const selfId = useAuthStore((s) => s.user?.user_id)
  const label = userId === selfId ? 'Yo' : userId.slice(0, 4).toUpperCase()
  return (
    <span
      title={userId === selfId ? 'Asignado a vos' : `Vendedor: ${userId}`}
      className="flex h-5 w-5 items-center justify-center rounded-full bg-brand/20 text-[9px] font-semibold text-brand"
    >
      {label.slice(0, 2)}
    </span>
  )
}

function MenuItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full px-3 py-1.5 text-left text-sm text-text hover:bg-surface-raised"
    >
      {children}
    </button>
  )
}

function OpportunityForm({
  stages,
  opportunity,
  onClose,
}: {
  stages: PipelineStage[]
  opportunity: Opportunity | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const toast = useUIStore((s) => s.toast)
  const selfId = useAuthStore((s) => s.user?.user_id)

  const [form, setForm] = useState<CreateOpportunityInput>({
    contact_id: opportunity?.contact_id ?? '',
    stage_id: opportunity?.stage_id ?? stages[0]?.id ?? '',
    title: opportunity?.title ?? '',
    amount: opportunity?.amount ?? '',
    currency: opportunity?.currency ?? 'ARS',
    probability_pct: opportunity?.probability_pct ?? undefined,
    expected_close_date: opportunity?.expected_close_date ?? '',
    assigned_user_id: opportunity?.assigned_user_id ?? selfId,
    source: opportunity?.source ?? '',
  })

  const save = useMutation({
    mutationFn: (body: CreateOpportunityInput) =>
      opportunity ? opportunitiesApi.update(opportunity.id, body) : opportunitiesApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['opportunities'] })
      qc.invalidateQueries({ queryKey: ['pipeline-forecast'] })
      toast.success(opportunity ? 'Oportunidad actualizada' : 'Oportunidad creada')
      onClose()
    },
    onError: () => toast.error('No se pudo guardar'),
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.contact_id || !form.title.trim()) {
      toast.error('Elegí un contacto y un título')
      return
    }
    save.mutate({
      ...form,
      amount: form.amount || undefined,
      expected_close_date: form.expected_close_date || undefined,
      source: form.source || undefined,
    })
  }

  return (
    <SlideOver open onClose={onClose} title={opportunity ? 'Editar oportunidad' : 'Nueva oportunidad'}>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <ContactPicker
          label="Contacto"
          required
          value={form.contact_id}
          onChange={(id) => setForm({ ...form, contact_id: id })}
        />
        <Input label="Título" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        <Select
          label="Etapa"
          value={form.stage_id}
          onChange={(e) => setForm({ ...form, stage_id: e.target.value })}
          options={stages.map((s) => ({ value: s.id, label: s.name }))}
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Monto"
            type="number"
            value={form.amount ?? ''}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
          <Select
            label="Moneda"
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}
            options={currencyOptions}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Probabilidad %"
            type="number"
            min={0}
            max={100}
            value={form.probability_pct ?? ''}
            onChange={(e) =>
              setForm({ ...form, probability_pct: e.target.value ? Number(e.target.value) : undefined })
            }
          />
          <Input
            label="Cierre estimado"
            type="date"
            value={form.expected_close_date ?? ''}
            onChange={(e) => setForm({ ...form, expected_close_date: e.target.value })}
          />
        </div>
        <Input label="Origen" value={form.source ?? ''} onChange={(e) => setForm({ ...form, source: e.target.value })} />
        <div className="mt-2 flex justify-end gap-3">
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

function LoseModal({ opportunity, onClose }: { opportunity: Opportunity; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useUIStore((s) => s.toast)
  const [reasonId, setReasonId] = useState('')
  const [custom, setCustom] = useState('')

  const reasonsQ = useQuery({ queryKey: ['lost-reasons'], queryFn: () => pipelineApi.lostReasons() })

  const lose = useMutation({
    mutationFn: () =>
      opportunitiesApi.lose(opportunity.id, {
        reason_id: reasonId || undefined,
        custom_reason: custom || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['opportunities'] })
      qc.invalidateQueries({ queryKey: ['pipeline-forecast'] })
      toast.success('Oportunidad marcada como perdida')
      onClose()
    },
    onError: () => toast.error('No se pudo marcar como perdida'),
  })

  return (
    <Modal open onClose={onClose} title="Marcar como perdida" size="sm">
      <div className="space-y-4">
        <Select
          label="Motivo"
          placeholder="Seleccioná un motivo"
          value={reasonId}
          onChange={(e) => setReasonId(e.target.value)}
          options={(reasonsQ.data ?? []).map((r) => ({ value: r.id, label: r.name }))}
        />
        <Input
          label="Motivo personalizado (opcional)"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
        />
        <div className="flex justify-end gap-3">
          <Button variant="secondary" size="md" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" size="md" onClick={() => lose.mutate()} loading={lose.isPending}>
            Marcar perdida
          </Button>
        </div>
      </div>
    </Modal>
  )
}
