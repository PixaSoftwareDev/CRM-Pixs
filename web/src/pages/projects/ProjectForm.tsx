import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SlideOver } from '../../components/ui/SlideOver'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Button } from '../../components/ui/Button'
import { ContactPicker } from '../../components/ui/ContactPicker'
import { useUIStore } from '../../stores/ui'
import { useAuthStore } from '../../stores/auth'
import { currencyOptions, projectStatusOptions } from '../../lib/crm'
import { projectsApi, type Project, type CreateProjectInput } from '../../lib/api/projects'

export function ProjectForm({
  open,
  onClose,
  project,
  initialClientId,
  initialName,
}: {
  open: boolean
  onClose: () => void
  project?: Project | null
  initialClientId?: string
  initialName?: string
}) {
  const qc = useQueryClient()
  const toast = useUIStore((s) => s.toast)
  const selfId = useAuthStore((s) => s.user?.user_id)

  const [form, setForm] = useState<CreateProjectInput>({
    client_id: project?.client_id ?? initialClientId ?? '',
    name: project?.name ?? initialName ?? '',
    description: project?.description ?? '',
    start_date: project?.start_date?.slice(0, 10) ?? '',
    estimated_end_date: project?.estimated_end_date?.slice(0, 10) ?? '',
    status: project?.status ?? 'active',
    responsible_id: project?.responsible_id ?? selfId,
    budget_hours: project?.budget_hours ?? '',
    budget_amount: project?.budget_amount ?? '',
    currency: project?.currency ?? 'ARS',
  })

  const save = useMutation({
    mutationFn: (body: CreateProjectInput) =>
      project ? projectsApi.update(project.id, body) : projectsApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      if (project) qc.invalidateQueries({ queryKey: ['project', project.id] })
      toast.success(project ? 'Proyecto actualizado' : 'Proyecto creado')
      onClose()
    },
    onError: () => toast.error('No se pudo guardar el proyecto'),
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.client_id || !form.name.trim()) {
      toast.error('Elegí un cliente y un nombre')
      return
    }
    save.mutate({
      ...form,
      description: form.description || undefined,
      start_date: form.start_date || undefined,
      estimated_end_date: form.estimated_end_date || undefined,
      budget_hours: form.budget_hours || undefined,
      budget_amount: form.budget_amount || undefined,
    })
  }

  return (
    <SlideOver open={open} onClose={onClose} title={project ? 'Editar proyecto' : 'Nuevo proyecto'} size="lg">
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <ContactPicker
          label="Cliente"
          required
          value={form.client_id}
          onChange={(id) => setForm({ ...form, client_id: id })}
        />
        <Input label="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text">Descripción</label>
          <textarea
            value={form.description ?? ''}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            className="w-full rounded border border-border bg-surface p-3 text-base text-text focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Inicio"
            type="date"
            value={form.start_date ?? ''}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
          />
          <Input
            label="Fin estimado"
            type="date"
            value={form.estimated_end_date ?? ''}
            onChange={(e) => setForm({ ...form, estimated_end_date: e.target.value })}
          />
        </div>
        <Select
          label="Estado"
          value={form.status}
          onChange={(e) => setForm({ ...form, status: e.target.value })}
          options={projectStatusOptions}
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Horas presupuestadas"
            type="number"
            value={form.budget_hours ?? ''}
            onChange={(e) => setForm({ ...form, budget_hours: e.target.value })}
          />
          <Input
            label="Monto presupuestado"
            type="number"
            value={form.budget_amount ?? ''}
            onChange={(e) => setForm({ ...form, budget_amount: e.target.value })}
          />
        </div>
        <Select
          label="Moneda"
          value={form.currency}
          onChange={(e) => setForm({ ...form, currency: e.target.value })}
          options={currencyOptions}
        />
        <Input
          label="Responsable (ID de usuario)"
          value={form.responsible_id ?? ''}
          onChange={(e) => setForm({ ...form, responsible_id: e.target.value })}
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
