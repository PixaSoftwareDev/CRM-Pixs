import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { SlideOver } from '../../components/ui/SlideOver'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { KPICard } from '../../components/ui/KPICard'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { Skeleton } from '../../components/ui/Skeleton'
import { useAuthStore } from '../../stores/auth'
import { useUIStore } from '../../stores/ui'
import { formatDate } from '../../lib/utils'
import {
  projectStatusColor,
  projectStatusLabel,
  milestoneStatusColor,
  milestoneStatusLabel,
  milestoneStatusOptions,
} from '../../lib/crm'
import { projectsApi, type Milestone, type MilestoneInput } from '../../lib/api/projects'
import { contactsApi } from '../../lib/api/contacts'
import { ProjectForm } from './ProjectForm'

export function ProjectDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const can = useAuthStore((s) => s.can)
  const [editOpen, setEditOpen] = useState(false)

  const { data: project, isLoading, isError, refetch } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.get(id),
    enabled: !!id,
  })
  const { data: client } = useQuery({
    queryKey: ['contact', project?.client_id],
    queryFn: () => contactsApi.get(project!.client_id),
    enabled: !!project?.client_id,
  })

  if (isLoading) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }
  if (isError || !project) {
    return (
      <div className="p-4 md:p-6">
        <ErrorState message="No pudimos cargar el proyecto." onRetry={() => refetch()} />
      </div>
    )
  }

  const canEdit = can('projects', 'edit') || can('projects', 'update')

  return (
    <div className="space-y-6 p-4 md:p-6">
      <button
        onClick={() => navigate('/proyectos')}
        className="flex items-center gap-1 text-sm text-text-secondary hover:text-text"
      >
        <ArrowLeft size={16} /> Volver a proyectos
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-text">{project.name}</h1>
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            {client && <span>{client.fantasy_name}</span>}
            <StatusBadge
              label={projectStatusLabel[project.status] ?? project.status}
              color={projectStatusColor[project.status] ?? 'neutral'}
            />
          </div>
        </div>
        {canEdit && (
          <Button variant="secondary" size="md" onClick={() => setEditOpen(true)}>
            <Pencil size={16} /> Editar
          </Button>
        )}
      </div>

      {project.description && (
        <p className="rounded-xl border border-border bg-surface p-4 text-sm text-text">
          {project.description}
        </p>
      )}

      <MilestonesSection projectId={id} canEdit={canEdit} />
      <MembersSection projectId={id} canEdit={canEdit} />
      <ProfitabilitySection projectId={id} />

      {editOpen && <ProjectForm open={editOpen} onClose={() => setEditOpen(false)} project={project} />}
    </div>
  )
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

// ---------- Milestones ----------

function MilestonesSection({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const qc = useQueryClient()
  const toast = useUIStore((s) => s.toast)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Milestone | null>(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['project', projectId, 'milestones'],
    queryFn: () => projectsApi.milestones.list(projectId),
  })

  const del = useMutation({
    mutationFn: (mid: string) => projectsApi.milestones.delete(projectId, mid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId, 'milestones'] })
      toast.success('Hito eliminado')
    },
    onError: () => toast.error('No se pudo eliminar'),
  })

  return (
    <Section
      title="Hitos"
      action={
        canEdit && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus size={14} /> Agregar hito
          </Button>
        )
      }
    >
      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState title="Sin hitos" description="Definí los entregables clave del proyecto." />
      ) : (
        <ul className="space-y-2">
          {data!.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between rounded-xl border border-border bg-surface p-4"
            >
              <div>
                <p className="font-medium text-text">{m.name}</p>
                <p className="text-sm text-text-secondary">
                  {m.committed_date ? formatDate(m.committed_date) : 'Sin fecha'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge
                  label={milestoneStatusLabel[m.status] ?? m.status}
                  color={milestoneStatusColor[m.status] ?? 'neutral'}
                />
                {canEdit && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => { setEditing(m); setFormOpen(true) }}>
                      <Pencil size={14} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => del.mutate(m.id)}>
                      <Trash2 size={14} />
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {formOpen && (
        <MilestoneForm projectId={projectId} milestone={editing} onClose={() => setFormOpen(false)} />
      )}
    </Section>
  )
}

function MilestoneForm({
  projectId,
  milestone,
  onClose,
}: {
  projectId: string
  milestone: Milestone | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const toast = useUIStore((s) => s.toast)
  const [form, setForm] = useState<MilestoneInput>({
    name: milestone?.name ?? '',
    committed_date: milestone?.committed_date?.slice(0, 10) ?? '',
    status: milestone?.status ?? 'pending',
    description: milestone?.description ?? '',
  })

  const save = useMutation({
    mutationFn: (body: MilestoneInput) =>
      milestone
        ? projectsApi.milestones.update(projectId, milestone.id, body)
        : projectsApi.milestones.create(projectId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId, 'milestones'] })
      toast.success(milestone ? 'Hito actualizado' : 'Hito agregado')
      onClose()
    },
    onError: () => toast.error('No se pudo guardar'),
  })

  return (
    <SlideOver open onClose={onClose} title={milestone ? 'Editar hito' : 'Agregar hito'}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!form.name.trim()) return
          save.mutate({ ...form, committed_date: form.committed_date || undefined, description: form.description || undefined })
        }}
      >
        <Input label="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <Input
          label="Fecha comprometida"
          type="date"
          value={form.committed_date ?? ''}
          onChange={(e) => setForm({ ...form, committed_date: e.target.value })}
        />
        <Select
          label="Estado"
          value={form.status}
          onChange={(e) => setForm({ ...form, status: e.target.value })}
          options={milestoneStatusOptions}
        />
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

// ---------- Members ----------

function MembersSection({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const qc = useQueryClient()
  const toast = useUIStore((s) => s.toast)
  const [userId, setUserId] = useState('')

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['project', projectId, 'members'],
    queryFn: () => projectsApi.members.list(projectId),
  })

  const add = useMutation({
    mutationFn: (uid: string) => projectsApi.members.add(projectId, uid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId, 'members'] })
      setUserId('')
      toast.success('Miembro agregado')
    },
    onError: () => toast.error('No se pudo agregar'),
  })
  const remove = useMutation({
    mutationFn: (uid: string) => projectsApi.members.remove(projectId, uid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId, 'members'] })
      toast.success('Miembro quitado')
    },
    onError: () => toast.error('No se pudo quitar'),
  })

  return (
    <Section title="Miembros">
      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <div className="space-y-3">
          {(data?.length ?? 0) === 0 ? (
            <p className="text-sm text-text-secondary">Sin miembros asignados.</p>
          ) : (
            <ul className="space-y-2">
              {data!.map((m) => (
                <li
                  key={m.user_id}
                  className="flex items-center justify-between rounded-xl border border-border bg-surface p-3"
                >
                  <span className="text-sm text-text">{m.full_name || m.email || m.user_id}</span>
                  {canEdit && (
                    <Button variant="ghost" size="sm" onClick={() => remove.mutate(m.user_id)}>
                      <Trash2 size={14} />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canEdit && (
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input
                  label="Agregar miembro"
                  placeholder="ID del usuario"
                  hint="ID del usuario"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                />
              </div>
              <Button
                variant="secondary"
                size="md"
                disabled={!userId.trim()}
                loading={add.isPending}
                onClick={() => add.mutate(userId.trim())}
              >
                Agregar
              </Button>
            </div>
          )}
        </div>
      )}
    </Section>
  )
}

// ---------- Profitability ----------

function ProfitabilitySection({ projectId }: { projectId: string }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['project', projectId, 'profitability'],
    queryFn: () => projectsApi.profitability(projectId),
  })

  return (
    <Section title="Rentabilidad">
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !data || Object.keys(data).length === 0 ? (
        <p className="text-sm text-text-secondary">Sin datos de rentabilidad todavía.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {Object.entries(data).map(([k, v]) => (
            <KPICard key={k} label={prettyKey(k)} value={formatValue(v)} />
          ))}
        </div>
      )}
    </Section>
  )
}

function prettyKey(k: string): string {
  return k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
function formatValue(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'number') return String(v)
  return String(v)
}
