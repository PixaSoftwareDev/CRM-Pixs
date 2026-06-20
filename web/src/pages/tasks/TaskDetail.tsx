import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Play, Square, UserCheck, Download, FileText, Trash2 } from 'lucide-react'
import { SlideOver } from '../../components/ui/SlideOver'
import { Button } from '../../components/ui/Button'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Skeleton } from '../../components/ui/Skeleton'
import { ErrorState } from '../../components/ui/ErrorState'
import { useAuthStore } from '../../stores/auth'
import { useUIStore } from '../../stores/ui'
import { formatRelativeTime, formatDate } from '../../lib/utils'
import {
  taskStatusColor,
  taskStatusLabel,
  taskPriorityLabel,
  taskPriorityDot,
} from '../../lib/crm'
import { tasksApi, taskTransitions } from '../../lib/api/tasks'
import { documentsApi } from '../../lib/api/documents'
import { FileDropzone } from '../../components/ui/FileDropzone'

function elapsed(fromIso: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(fromIso).getTime()) / 1000))
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

export function TaskDetail({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useUIStore((s) => s.toast)
  const can = useAuthStore((s) => s.can)
  const selfId = useAuthStore((s) => s.user?.user_id)
  const activeTimer = useUIStore((s) => s.activeTimer)
  const setActiveTimer = useUIStore((s) => s.setActiveTimer)

  const { data: task, isLoading, isError, refetch } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => tasksApi.get(taskId),
  })

  const setStatus = useMutation({
    mutationFn: (status: string) => tasksApi.setStatus(taskId, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['task', taskId, 'history'] })
      toast.success('Estado actualizado')
    },
    onError: () => toast.error('No se pudo cambiar el estado'),
  })

  const startTimer = useMutation({
    mutationFn: () => tasksApi.timer.start(taskId),
    onSuccess: () => {
      setActiveTimer({ taskId, startedAt: new Date().toISOString() })
      toast.success('Cronómetro iniciado')
    },
    onError: () => toast.error('No se pudo iniciar el cronómetro'),
  })
  const stopTimer = useMutation({
    mutationFn: (id: string) => tasksApi.timer.stop(id),
    onSuccess: () => {
      setActiveTimer(null)
      toast.success('Cronómetro detenido')
    },
    onError: () => toast.error('No se pudo detener el cronómetro'),
  })

  const reassign = useMutation({
    mutationFn: (userId: string) => tasksApi.assign(taskId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('Tarea reasignada')
      setReassignOpen(false)
    },
    onError: () => toast.error('No se pudo reasignar'),
  })

  const [reassignOpen, setReassignOpen] = useState(false)
  const [newAssignee, setNewAssignee] = useState('')

  // Tick every second when this task's timer is active.
  const [, setTick] = useState(0)
  const timerActiveHere = activeTimer?.taskId === taskId
  useEffect(() => {
    if (!timerActiveHere) return
    const i = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(i)
  }, [timerActiveHere])

  return (
    <SlideOver open onClose={onClose} title="Detalle de tarea" size="lg">
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : isError || !task ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: taskPriorityDot[task.priority] ?? '#9ca3af' }}
                title={taskPriorityLabel[task.priority] ?? task.priority}
              />
              <h3 className="text-lg font-semibold text-text">{task.title}</h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge label={taskStatusLabel[task.status] ?? task.status} color={taskStatusColor[task.status] ?? 'neutral'} />
              <span className="text-xs text-text-secondary">
                Prioridad: {taskPriorityLabel[task.priority] ?? task.priority}
              </span>
            </div>
          </div>

          {task.description && (
            <p className="whitespace-pre-wrap rounded-lg border border-border bg-surface p-3 text-sm text-text">
              {task.description}
            </p>
          )}

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Meta label="Vencimiento" value={task.due_date ? formatDate(task.due_date) : '—'} />
            <Meta label="Asignado" value={task.assignee_id ?? '—'} />
          </dl>

          {/* Timer */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="mb-2 text-sm font-medium text-text">Cronómetro</p>
            {timerActiveHere ? (
              <div className="flex items-center gap-3">
                <span className="font-mono text-lg text-text">{elapsed(activeTimer!.startedAt)}</span>
                <Button variant="danger" size="md" loading={stopTimer.isPending} onClick={() => stopTimer.mutate(taskId)}>
                  <Square size={16} /> Detener
                </Button>
              </div>
            ) : activeTimer ? (
              <Button
                variant="secondary"
                size="md"
                loading={stopTimer.isPending}
                onClick={() => stopTimer.mutate(activeTimer.taskId)}
              >
                <Square size={16} /> Detener timer de otra tarea
              </Button>
            ) : (
              <Button variant="primary" size="md" loading={startTimer.isPending} onClick={() => startTimer.mutate()}>
                <Play size={16} /> Iniciar
              </Button>
            )}
          </div>

          {/* Status transitions */}
          {(taskTransitions[task.status] ?? []).length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium text-text">Cambiar estado</p>
              <div className="flex flex-wrap gap-2">
                {(taskTransitions[task.status] ?? []).map((next) => (
                  <Button
                    key={next}
                    variant="secondary"
                    size="sm"
                    loading={setStatus.isPending}
                    onClick={() => setStatus.mutate(next)}
                  >
                    {taskStatusLabel[next] ?? next}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Reassign */}
          {can('tasks', 'assign') && (
            <div>
              <p className="mb-2 text-sm font-medium text-text">Asignado a</p>
              <div className="flex items-center gap-2">
                <span className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text">
                  {task.assignee_id
                    ? task.assignee_id === selfId
                      ? 'Vos'
                      : task.assignee_id
                    : 'Sin asignar'}
                </span>
                {!reassignOpen && (
                  <Button variant="ghost" size="sm" onClick={() => { setNewAssignee(task.assignee_id ?? selfId ?? ''); setReassignOpen(true) }}>
                    <UserCheck size={14} /> Reasignar
                  </Button>
                )}
              </div>
              {reassignOpen && (
                <div className="mt-2 flex gap-2">
                  <input
                    value={newAssignee}
                    onChange={(e) => setNewAssignee(e.target.value)}
                    placeholder="ID de usuario"
                    className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text placeholder:text-text-tertiary focus:border-brand focus:outline-none"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    loading={reassign.isPending}
                    disabled={!newAssignee.trim()}
                    onClick={() => reassign.mutate(newAssignee.trim())}
                  >
                    Guardar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setReassignOpen(false)}>
                    Cancelar
                  </Button>
                </div>
              )}
            </div>
          )}

          <CommentsSection taskId={taskId} />
          <TaskDocumentsSection taskId={taskId} />
          <HistorySection taskId={taskId} />
        </div>
      )}
    </SlideOver>
  )
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function TaskDocumentsSection({ taskId }: { taskId: string }) {
  const qc = useQueryClient()
  const toast = useUIStore((s) => s.toast)
  const key = ['task', taskId, 'documents']

  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => documentsApi.list('task', taskId),
  })

  const upload = useMutation({
    mutationFn: (file: File) => documentsApi.upload('task', taskId, file),
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success('Documento subido') },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo subir'),
  })
  const del = useMutation({
    mutationFn: (id: string) => documentsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success('Documento eliminado') },
    onError: () => toast.error('No se pudo eliminar'),
  })

  const docs = data ?? []

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-text">Documentos</p>
      <div className="mb-3">
        <FileDropzone onFile={(f) => upload.mutate(f)} pending={upload.isPending} compact />
      </div>
      {isLoading ? (
        <Skeleton className="h-12 w-full" />
      ) : docs.length === 0 ? (
        <p className="text-xs text-text-tertiary">Sin documentos adjuntos.</p>
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between rounded-lg border border-border bg-surface p-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={15} className="shrink-0 text-text-tertiary" />
                <div className="min-w-0">
                  <p className="truncate text-sm text-text">{d.file_name}</p>
                  <p className="text-xs text-text-tertiary">{fmtBytes(d.size_bytes)}</p>
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <a href={documentsApi.downloadUrl(d.id)} target="_blank" rel="noreferrer"
                  className="rounded p-1.5 text-text-tertiary hover:bg-surface-subtle hover:text-text" title="Descargar">
                  <Download size={15} />
                </a>
                <Button variant="ghost" size="sm" onClick={() => del.mutate(d.id)}>
                  <Trash2 size={13} />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-text-tertiary">{label}</dt>
      <dd className="text-text">{value}</dd>
    </div>
  )
}

function CommentsSection({ taskId }: { taskId: string }) {
  const qc = useQueryClient()
  const toast = useUIStore((s) => s.toast)
  const [body, setBody] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['task', taskId, 'comments'],
    queryFn: () => tasksApi.comments.list(taskId),
  })

  const add = useMutation({
    mutationFn: (text: string) => tasksApi.comments.create(taskId, text),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId, 'comments'] })
      setBody('')
    },
    onError: () => toast.error('No se pudo comentar'),
  })

  const comments = [...(data ?? [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-text">Comentarios</p>
      {isLoading ? (
        <Skeleton className="h-12 w-full" />
      ) : comments.length === 0 ? (
        <p className="text-sm text-text-secondary">Sin comentarios.</p>
      ) : (
        <ul className="space-y-2">
          {comments.map((c) => (
            <li key={c.id} className="rounded-lg border border-border bg-surface p-3">
              <p className="whitespace-pre-wrap text-sm text-text">{c.body}</p>
              <p className="mt-1 text-xs text-text-tertiary">{formatRelativeTime(c.created_at)}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 space-y-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="Escribí un comentario…"
          className="w-full rounded border border-border bg-surface p-3 text-sm text-text focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
        <div className="flex justify-end">
          <Button variant="primary" size="md" disabled={!body.trim()} loading={add.isPending} onClick={() => add.mutate(body.trim())}>
            Comentar
          </Button>
        </div>
      </div>
    </div>
  )
}

function HistorySection({ taskId }: { taskId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['task', taskId, 'history'],
    queryFn: () => tasksApi.history(taskId),
  })

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-text">Historial</p>
      {isLoading ? (
        <Skeleton className="h-12 w-full" />
      ) : (data?.length ?? 0) === 0 ? (
        <p className="text-sm text-text-secondary">Sin cambios registrados.</p>
      ) : (
        <ul className="space-y-1.5">
          {data!.map((h) => (
            <li key={h.id} className="flex items-center justify-between text-sm">
              <span className="text-text">
                {h.from_status || h.to_status
                  ? `${taskStatusLabel[h.from_status ?? ''] ?? h.from_status ?? '—'} → ${
                      taskStatusLabel[h.to_status ?? ''] ?? h.to_status ?? '—'
                    }`
                  : h.field ?? 'Cambio'}
              </span>
              <span className="text-xs text-text-tertiary">{formatRelativeTime(h.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
