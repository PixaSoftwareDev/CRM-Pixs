import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckSquare, Plus, List, Columns } from 'lucide-react'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Select'
import { Input } from '../../components/ui/Input'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { Skeleton } from '../../components/ui/Skeleton'
import { useAuthStore } from '../../stores/auth'
import { formatDate, cn } from '../../lib/utils'
import { taskStatusColor, taskStatusLabel, taskPriorityLabel, taskPriorityDot } from '../../lib/crm'
import { tasksApi, type Task } from '../../lib/api/tasks'
import { projectsApi } from '../../lib/api/projects'
import { ContactPicker } from '../../components/ui/ContactPicker'
import { TaskForm } from './TaskForm'
import { TaskDetail } from './TaskDetail'

const statusFilter = [
  { value: '', label: 'Todos los estados' },
  { value: 'open', label: 'Abierto' },
  { value: 'in_progress', label: 'En progreso' },
  { value: 'waiting_client', label: 'Espera cliente' },
  { value: 'waiting_internal', label: 'Espera interna' },
  { value: 'resolved', label: 'Resuelto' },
  { value: 'closed', label: 'Cerrado' },
  { value: 'cancelled', label: 'Cancelado' },
]

const boardColumns: { key: string; label: string; statuses: string[] }[] = [
  { key: 'open', label: 'Abierto', statuses: ['open'] },
  { key: 'in_progress', label: 'En progreso', statuses: ['in_progress'] },
  { key: 'waiting', label: 'En espera', statuses: ['waiting_client', 'waiting_internal'] },
  { key: 'resolved', label: 'Resuelto', statuses: ['resolved'] },
  { key: 'closed', label: 'Cerrado', statuses: ['closed', 'cancelled'] },
]

export function TasksPage() {
  const can = useAuthStore((s) => s.can)
  const selfId = useAuthStore((s) => s.user?.user_id)
  const [view, setView] = useState<'list' | 'board'>('list')
  const [status, setStatus] = useState('')
  const [onlyMine, setOnlyMine] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [contactId, setContactId] = useState('')
  const [dueBefore, setDueBefore] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  const projectsQ = useQuery({ queryKey: ['projects'], queryFn: () => projectsApi.list() })

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['tasks', { status, onlyMine, projectId, contactId, dueBefore }],
    queryFn: () =>
      tasksApi.list({
        status: status || undefined,
        assignee_id: onlyMine ? selfId : undefined,
        project_id: projectId || undefined,
        contact_id: contactId || undefined,
        due_before: dueBefore || undefined,
      }),
  })

  const tasks = data ?? []
  const projectOptions = [
    { value: '', label: 'Todos los proyectos' },
    ...(projectsQ.data ?? []).map((p) => ({ value: p.id, label: p.name })),
  ]

  const projectMap = new Map((projectsQ.data ?? []).map((p) => [p.id, p.name]))

  const columns: Column<Task>[] = [
    {
      key: 'title',
      header: 'Título',
      render: (t) => (
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: taskPriorityDot[t.priority] ?? '#9ca3af' }}
            title={taskPriorityLabel[t.priority] ?? t.priority}
          />
          <span className="font-medium text-text">{t.title}</span>
        </div>
      ),
    },
    {
      key: 'project',
      header: 'Proyecto',
      render: (t) => t.project_id ? (
        <span className="text-sm text-text-secondary">{projectMap.get(t.project_id) ?? '—'}</span>
      ) : <span className="text-text-tertiary">—</span>,
    },
    {
      key: 'status',
      header: 'Estado',
      render: (t) => (
        <StatusBadge label={taskStatusLabel[t.status] ?? t.status} color={taskStatusColor[t.status] ?? 'neutral'} />
      ),
    },
    { key: 'assignee', header: 'Asignado', render: (t) => t.assignee_id ?? '—' },
    { key: 'due', header: 'Vencimiento', render: (t) => (t.due_date ? formatDate(t.due_date) : '—') },
  ]

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-text">Tareas</h1>
        {can('tasks', 'create') && (
          <Button variant="primary" size="lg" onClick={() => setFormOpen(true)}>
            <Plus size={20} />
            Nueva tarea
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex rounded-lg border border-border p-0.5">
          <button
            type="button"
            onClick={() => setView('list')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm',
              view === 'list' ? 'bg-surface-raised text-text' : 'text-text-secondary',
            )}
          >
            <List size={16} /> Lista
          </button>
          <button
            type="button"
            onClick={() => setView('board')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm',
              view === 'board' ? 'bg-surface-raised text-text' : 'text-text-secondary',
            )}
          >
            <Columns size={16} /> Tablero
          </button>
        </div>
        <div className="w-44">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} options={statusFilter} aria-label="Estado" />
        </div>
        <div className="w-48">
          <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} options={projectOptions} aria-label="Proyecto" />
        </div>
        <div className="w-44">
          <Input type="date" value={dueBefore} onChange={(e) => setDueBefore(e.target.value)} aria-label="Vence antes de" />
        </div>
        <div className="w-52">
          <ContactPicker value={contactId} onChange={(id) => setContactId(id)} label="Contacto" />
        </div>
        <label className="flex h-10 items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={onlyMine}
            onChange={(e) => setOnlyMine(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-brand"
          />
          Solo mías
        </label>
      </div>

      {isError ? (
        <ErrorState message="No pudimos cargar las tareas." onRetry={() => refetch()} />
      ) : view === 'list' ? (
        <DataTable
          columns={columns}
          rows={tasks}
          rowKey={(t) => t.id}
          loading={isLoading}
          onRowClick={(t) => setDetailId(t.id)}
          emptyState={
            <EmptyState
              icon={<CheckSquare size={28} />}
              title="Todavía no hay tareas"
              description="Creá una tarea para organizar el trabajo del equipo."
              action={can('tasks', 'create') ? { label: 'Nueva tarea', onClick: () => setFormOpen(true) } : undefined}
            />
          }
        />
      ) : isLoading ? (
        <div className="flex gap-4">
          {boardColumns.map((c) => (
            <Skeleton key={c.key} className="h-64 w-64" />
          ))}
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {boardColumns.map((col) => {
            const colTasks = tasks.filter((t) => col.statuses.includes(t.status))
            return (
              <div key={col.key} className="flex w-64 shrink-0 flex-col rounded-xl border border-border bg-surface-raised">
                <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
                  <span className="text-sm font-medium text-text">{col.label}</span>
                  <span className="rounded-full bg-surface px-1.5 text-xs text-text-secondary">{colTasks.length}</span>
                </div>
                <div className="flex flex-col gap-2 p-2">
                  {colTasks.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setDetailId(t.id)}
                      className="rounded-lg border border-border bg-surface p-3 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: taskPriorityDot[t.priority] ?? '#9ca3af' }}
                        />
                        <span className="truncate text-sm font-medium text-text">{t.title}</span>
                      </div>
                      {t.project_id && (
                        <p className="mt-1 truncate text-xs text-brand/80">{projectMap.get(t.project_id)}</p>
                      )}
                    </button>
                  ))}
                  {colTasks.length === 0 && (
                    <p className="px-2 py-4 text-center text-xs text-text-tertiary">Sin tareas</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {formOpen && (
        <TaskForm
          open={formOpen}
          onClose={() => setFormOpen(false)}
          projects={projectsQ.data ?? []}
        />
      )}
      {detailId && <TaskDetail taskId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  )
}
