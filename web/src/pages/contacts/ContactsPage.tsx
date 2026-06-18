import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Users, Plus, Search } from 'lucide-react'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { useAuthStore } from '../../stores/auth'
import { contactsApi, type Contact } from '../../lib/api/contacts'
import {
  contactKindColor,
  contactKindLabel,
  lifecycleColor,
  lifecycleLabel,
} from '../../lib/crm'
import { ContactForm } from './ContactForm'

const kindFilterOptions = [
  { value: '', label: 'Todos los tipos' },
  { value: 'cliente', label: 'Clientes' },
  { value: 'proveedor', label: 'Proveedores' },
  { value: 'prospecto', label: 'Prospectos' },
]

export function ContactsPage() {
  const navigate = useNavigate()
  const can = useAuthStore((s) => s.can)
  const selfId = useAuthStore((s) => s.user?.user_id)
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [kind, setKind] = useState('')
  const [onlyMine, setOnlyMine] = useState(false)
  const [formOpen, setFormOpen] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['contacts', { q: debounced, kind, onlyMine }],
    queryFn: () =>
      contactsApi.list({
        q: debounced || undefined,
        kind: kind || undefined,
        assigned_user_id: onlyMine ? selfId : undefined,
      }),
  })

  const columns: Column<Contact>[] = [
    {
      key: 'name',
      header: 'Nombre',
      render: (c) => <span className="font-medium text-text">{c.fantasy_name}</span>,
    },
    {
      key: 'kind',
      header: 'Tipo',
      render: (c) => (
        <div className="flex flex-wrap gap-1">
          {c.kind.map((k) => (
            <StatusBadge key={k} label={contactKindLabel[k] ?? k} color={contactKindColor[k] ?? 'neutral'} />
          ))}
        </div>
      ),
    },
    { key: 'city', header: 'Ciudad', render: (c) => c.city || '—' },
    {
      key: 'lifecycle',
      header: 'Estado',
      render: (c) => (
        <StatusBadge
          label={lifecycleLabel[c.lifecycle_status] ?? c.lifecycle_status}
          color={lifecycleColor[c.lifecycle_status] ?? 'neutral'}
        />
      ),
    },
  ]

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-text">Contactos</h1>
        {can('contacts', 'create') && (
          <Button variant="primary" size="lg" onClick={() => setFormOpen(true)}>
            <Plus size={20} />
            Nuevo contacto
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <Input
            placeholder="Buscar contactos…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            aria-label="Buscar contactos"
          />
        </div>
        <div className="w-48">
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            options={kindFilterOptions}
            aria-label="Filtrar por tipo"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-text whitespace-nowrap">
          <input
            type="checkbox"
            checked={onlyMine}
            onChange={(e) => setOnlyMine(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-brand"
          />
          Solo mis contactos
        </label>
      </div>

      {isError ? (
        <ErrorState message="No pudimos cargar los contactos." onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={data ?? []}
          rowKey={(c) => c.id}
          loading={isLoading}
          onRowClick={(c) => navigate(`/contactos/${c.id}`)}
          emptyState={
            <EmptyState
              icon={<Users size={28} />}
              title="Todavía no hay contactos"
              description="Cargá tu primer contacto para empezar a gestionar clientes y proveedores."
              action={
                can('contacts', 'create')
                  ? { label: 'Cargar primer contacto', onClick: () => setFormOpen(true) }
                  : undefined
              }
            />
          }
        />
      )}

      {formOpen && <ContactForm open={formOpen} onClose={() => setFormOpen(false)} />}
    </div>
  )
}
