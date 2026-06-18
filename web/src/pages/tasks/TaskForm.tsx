import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SlideOver } from '../../components/ui/SlideOver'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Button } from '../../components/ui/Button'
import { ContactPicker } from '../../components/ui/ContactPicker'
import { useUIStore } from '../../stores/ui'
import { useAuthStore } from '../../stores/auth'
import { taskPriorityOptions } from '../../lib/crm'
import { tasksApi, type Task, type CreateTaskInput } from '../../lib/api/tasks'

const taskStatusCreate = [
  { value: 'open', label: 'Abierto' },
  { value: 'in_progress', label: 'En progreso' },
]

export function TaskForm({
  open,
  onClose,
  task,
  projects,
}: {
  open: boolean
  onClose: () => void
  task?: Task | null
  projects: { id: string; name: string }[]
}) {
  const qc = useQueryClient()
  const toast = useUIStore((s) => s.toast)
  const selfId = useAuthStore((s) => s.user?.user_id)

  const [form, setForm] = useState<CreateTaskInput>({
    title: task?.title ?? '',
    description: task?.description ?? '',
    contact_id: task?.contact_id ?? '',
    project_id: task?.project_id ?? '',
    assignee_id: task?.assignee_id ?? selfId,
    status: task?.status ?? 'open',
    priority: task?.priority ?? 'medium',
    due_date: task?.due_date?.slice(0, 10) ?? '',
  })

  const save = useMutation({
    mutationFn: (body: CreateTaskInput) =>
      task ? tasksApi.update(task.id, body) : tasksApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      if (task) qc.invalidateQueries({ queryKey: ['task', task.id] })
      toast.success(task ? 'Tarea actualizada' : 'Tarea creada')
      onClose()
    },
    onError: () => toast.error('No se pudo guardar la tarea'),
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) {
      toast.error('Ingresá un título')
      return
    }
    save.mutate({
      ...form,
      description: form.description || undefined,
      contact_id: form.contact_id || undefined,
      project_id: form.project_id || undefined,
      due_date: form.due_date || undefined,
    })
  }

  return (
    <SlideOver open={open} onClose={onClose} title={task ? 'Editar tarea' : 'Nueva tarea'} size="lg">
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <Input label="Título" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text">Descripción</label>
          <textarea
            value={form.description ?? ''}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={4}
            className="w-full rounded border border-border bg-surface p-3 text-base text-text focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Estado"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
            options={taskStatusCreate}
          />
          <Select
            label="Prioridad"
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value })}
            options={taskPriorityOptions}
          />
        </div>
        <Select
          label="Proyecto"
          placeholder="Sin proyecto"
          value={form.project_id ?? ''}
          onChange={(e) => setForm({ ...form, project_id: e.target.value })}
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
        />
        <ContactPicker
          label="Contacto"
          value={form.contact_id ?? ''}
          onChange={(id) => setForm({ ...form, contact_id: id })}
        />
        <Input
          label="Vencimiento"
          type="date"
          value={form.due_date ?? ''}
          onChange={(e) => setForm({ ...form, due_date: e.target.value })}
        />
        <Input
          label="Asignado a (ID de usuario)"
          value={form.assignee_id ?? ''}
          onChange={(e) => setForm({ ...form, assignee_id: e.target.value })}
          hint="Por defecto, vos."
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
