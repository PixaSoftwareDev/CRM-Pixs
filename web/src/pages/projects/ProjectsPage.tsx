import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueries, useQuery } from '@tanstack/react-query'
import { FolderOpen, Plus } from 'lucide-react'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Select'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { ContactPicker } from '../../components/ui/ContactPicker'
import { useAuthStore } from '../../stores/auth'
import { formatDate } from '../../lib/utils'
import { projectStatusColor, projectStatusLabel } from '../../lib/crm'
import { projectsApi, type Project } from '../../lib/api/projects'
import { contactsApi } from '../../lib/api/contacts'
import { ProjectForm } from './ProjectForm'

const statusFilterOptions = [
  { value: '', label: 'Todos los estados' },
  { value: 'active', label: 'Activos' },
  { value: 'paused', label: 'Pausados' },
  { value: 'completed', label: 'Completados' },
  { value: 'cancelled', label: 'Cancelados' },
]

export function ProjectsPage() {
  const navigate = useNavigate()
  const can = useAuthStore((s) => s.can)
  const selfId = useAuthStore((s) => s.user?.user_id)
  const [status, setStatus] = useState('')
  const [clientId, setClientId] = useState('')
  const [formOpen, setFormOpen] = useState(false)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['projects', status, clientId],
    queryFn: () => projectsApi.list({ status: status || undefined, client_id: clientId || undefined }),
  })

  // Resolve client names in parallel.
  const clientIds = [...new Set((data ?? []).map((p) => p.client_id))]
  const clientQueries = useQueries({
    queries: clientIds.map((cid) => ({
      queryKey: ['contact', cid],
      queryFn: () => contactsApi.get(cid),
      staleTime: 60_000,
    })),
  })
  const clientName: Record<string, string> = {}
  clientQueries.forEach((q) => {
    if (q.data) clientName[q.data.id] = q.data.fantasy_name
  })

  const columns: Column<Project>[] = [
    { key: 'name', header: 'Nombre', render: (p) => <span className="font-medium text-text">{p.name}</span> },
    { key: 'client', header: 'Cliente', render: (p) => clientName[p.client_id] ?? '…' },
    {
      key: 'status',
      header: 'Estado',
      render: (p) => (
        <StatusBadge label={projectStatusLabel[p.status] ?? p.status} color={projectStatusColor[p.status] ?? 'neutral'} />
      ),
    },
    {
      key: 'responsible',
      header: 'Responsable',
      render: (p) => {
        if (!p.responsible_id) return <span className="text-text-tertiary">—</span>
        return (
          <span
            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand/20 text-[10px] font-semibold text-brand"
            title={p.responsible_id === selfId ? 'Vos' : p.responsible_id}
          >
            {p.responsible_id === selfId ? 'Yo' : p.responsible_id.slice(0, 2).toUpperCase()}
          </span>
        )
      },
    },
    { key: 'start', header: 'Inicio', render: (p) => (p.start_date ? formatDate(p.start_date) : '—') },
    { key: 'end', header: 'Fin estimado', render: (p) => (p.estimated_end_date ? formatDate(p.estimated_end_date) : '—') },
  ]

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-text">Proyectos</h1>
        {can('projects', 'create') && (
          <Button variant="primary" size="lg" onClick={() => setFormOpen(true)}>
            <Plus size={20} />
            Nuevo proyecto
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-52">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} options={statusFilterOptions} aria-label="Filtrar por estado" />
        </div>
        <div className="w-56">
          <ContactPicker
            label="Cliente"
            value={clientId}
            onChange={(id) => setClientId(id)}
          />
        </div>
      </div>

      {isError ? (
        <ErrorState message="No pudimos cargar los proyectos." onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={data ?? []}
          rowKey={(p) => p.id}
          loading={isLoading}
          onRowClick={(p) => navigate(`/proyectos/${p.id}`)}
          emptyState={
            <EmptyState
              icon={<FolderOpen size={28} />}
              title="Todavía no hay proyectos"
              description="Creá tu primer proyecto para organizar la entrega."
              action={
                can('projects', 'create') ? { label: 'Crear proyecto', onClick: () => setFormOpen(true) } : undefined
              }
            />
          }
        />
      )}

      {formOpen && <ProjectForm open={formOpen} onClose={() => setFormOpen(false)} />}
    </div>
  )
}
