import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Select'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { KPICard } from '../../components/ui/KPICard'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { Skeleton } from '../../components/ui/Skeleton'
import { useAuthStore } from '../../stores/auth'
import { useUIStore } from '../../stores/ui'
import { formatDate, formatMoney } from '../../lib/utils'
import {
  projectStatusColor,
  projectStatusLabel,
  taskStatusLabel,
  taskStatusColor,
  taskPriorityLabel,
  taskPriorityDot,
} from '../../lib/crm'
import { projectsApi } from '../../lib/api/projects'
import { contactsApi } from '../../lib/api/contacts'
import { adminApi } from '../../lib/api/admin'
import { tasksApi, type Task } from '../../lib/api/tasks'
import { ProjectForm } from './ProjectForm'
import { TaskForm } from '../tasks/TaskForm'

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

      <TasksSection projectId={id} projectName={project.name} canEdit={canEdit} />
      <MembersSection projectId={id} canEdit={canEdit} />
      <ProfitabilitySection projectId={id} currency={project.currency} />

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

// ---------- Tasks ----------

function TasksSection({
  projectId,
  projectName,
  canEdit,
}: {
  projectId: string
  projectName: string
  canEdit: boolean
}) {
  const [formOpen, setFormOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)

  const { data: projectsAll } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list(),
  })

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['tasks', { project_id: projectId }],
    queryFn: () => tasksApi.list({ project_id: projectId }),
  })

  const openNew = () => {
    setEditingTask(null)
    setFormOpen(true)
  }

  return (
    <Section
      title="Tareas"
      action={
        canEdit && (
          <Button variant="secondary" size="sm" onClick={openNew}>
            <Plus size={14} /> Nueva tarea
          </Button>
        )
      }
    >
      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState title="Sin tareas" description="Creá la primera tarea para este proyecto." />
      ) : (
        <ul className="space-y-2">
          {data!.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between rounded-xl border border-border bg-surface p-4 cursor-pointer hover:bg-surface-raised"
              onClick={() => { setEditingTask(t); setFormOpen(true) }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: taskPriorityDot[t.priority] ?? '#9ca3af' }}
                />
                <div className="min-w-0">
                  <p className="truncate font-medium text-text">{t.title}</p>
                  <p className="text-xs text-text-secondary">
                    {taskPriorityLabel[t.priority] ?? t.priority}
                    {t.due_date ? ` · Vence ${formatDate(t.due_date)}` : ''}
                  </p>
                </div>
              </div>
              <StatusBadge
                label={taskStatusLabel[t.status] ?? t.status}
                color={taskStatusColor[t.status] ?? 'neutral'}
              />
            </li>
          ))}
        </ul>
      )}
      {formOpen && (
        <TaskForm
          open={formOpen}
          onClose={() => setFormOpen(false)}
          task={editingTask}
          projects={projectsAll ?? [{ id: projectId, name: projectName }]}
          initialProjectId={projectId}
        />
      )}
    </Section>
  )
}

// ---------- Members ----------

function MembersSection({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const qc = useQueryClient()
  const toast = useUIStore((s) => s.toast)
  const [selectedUserId, setSelectedUserId] = useState('')

  const { data: members, isLoading, isError, refetch } = useQuery({
    queryKey: ['project', projectId, 'members'],
    queryFn: () => projectsApi.members.list(projectId),
  })

  const { data: allUsers } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => adminApi.users.list(),
    enabled: canEdit,
  })

  const memberIds = new Set(members?.map((m) => m.user_id) ?? [])
  const availableUsers = (allUsers ?? []).filter((u) => !memberIds.has(u.id))

  const add = useMutation({
    mutationFn: (uid: string) => projectsApi.members.add(projectId, uid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId, 'members'] })
      setSelectedUserId('')
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
          {(members?.length ?? 0) === 0 ? (
            <p className="text-sm text-text-secondary">Sin miembros asignados.</p>
          ) : (
            <ul className="space-y-2">
              {members!.map((m) => (
                <li
                  key={m.user_id}
                  className="flex items-center justify-between rounded-xl border border-border bg-surface p-3"
                >
                  <div>
                    <p className="text-sm font-medium text-text">{m.full_name || m.email}</p>
                    {m.full_name && <p className="text-xs text-text-secondary">{m.email}</p>}
                  </div>
                  {canEdit && (
                    <Button variant="ghost" size="sm" onClick={() => remove.mutate(m.user_id)}>
                      <Trash2 size={14} />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canEdit && availableUsers.length > 0 && (
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Select
                  label="Agregar miembro"
                  placeholder="Seleccioná un usuario"
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  options={availableUsers.map((u) => ({
                    value: u.id,
                    label: u.full_name || u.email,
                  }))}
                />
              </div>
              <Button
                variant="secondary"
                size="md"
                disabled={!selectedUserId}
                loading={add.isPending}
                onClick={() => add.mutate(selectedUserId)}
              >
                Agregar
              </Button>
            </div>
          )}
          {canEdit && availableUsers.length === 0 && (members?.length ?? 0) > 0 && (
            <p className="text-xs text-text-tertiary">Todos los usuarios ya son miembros.</p>
          )}
        </div>
      )}
    </Section>
  )
}

// ---------- Profitability ----------

const profitabilityLabels: Record<string, string> = {
  BudgetHours: 'Horas presupuestadas',
  TotalHours: 'Horas registradas',
  BillableHours: 'Horas facturables',
  BudgetAmount: 'Presupuesto',
  LaborCost: 'Costo mano de obra',
  TotalMinutes: 'Minutos totales',
  BilledMinutes: 'Minutos facturados',
}

function ProfitabilitySection({ projectId, currency }: { projectId: string; currency: string }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['project', projectId, 'profitability'],
    queryFn: () => projectsApi.profitability(projectId),
  })

  const formatProfitValue = (key: string, v: unknown): string => {
    if (v == null) return '—'
    const s = String(v)
    if (key === 'BudgetAmount' || key === 'LaborCost') return formatMoney(s, currency)
    if (key === 'BudgetHours' || key === 'TotalHours' || key === 'BillableHours') {
      const n = parseFloat(s)
      return isNaN(n) ? '—' : `${n.toFixed(1)} hs`
    }
    if (key === 'TotalMinutes' || key === 'BilledMinutes') {
      const n = Number(v)
      if (isNaN(n)) return '—'
      const h = Math.floor(n / 60)
      const m = n % 60
      return h > 0 ? `${h}h ${m}m` : `${m}m`
    }
    return s
  }

  const visibleKeys = Object.keys(profitabilityLabels)

  return (
    <Section title="Rentabilidad">
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !data ? (
        <p className="text-sm text-text-secondary">Sin datos de rentabilidad todavía.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {visibleKeys.map((k) => {
            const v = (data as Record<string, unknown>)[k]
            if (v == null) return null
            return (
              <KPICard
                key={k}
                label={profitabilityLabels[k]}
                value={formatProfitValue(k, v)}
              />
            )
          })}
        </div>
      )}
    </Section>
  )
}
