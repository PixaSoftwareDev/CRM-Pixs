import { useEffect, useMemo, useState } from 'react'
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
import { contactsApi, industriesApi, type Contact } from '../../lib/api/contacts'
import {
  contactKindColor,
  contactKindLabel,
  lifecycleColor,
  lifecycleLabel,
} from '../../lib/crm'
import { ContactForm } from './ContactForm'

const kindTabs = [
  { value: '', label: 'Todos' },
  { value: 'client', label: 'Clientes' },
  { value: 'supplier', label: 'Proveedores' },
  { value: 'prospect', label: 'Prospectos' },
  { value: 'lead', label: 'Leads' },
]

export function ContactsPage() {
  const navigate = useNavigate()
  const can = useAuthStore((s) => s.can)
  const selfId = useAuthStore((s) => s.user?.user_id)
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [kind, setKind] = useState('')
  const [industry, setIndustry] = useState('')
  const [onlyMine, setOnlyMine] = useState(false)
  const [formOpen, setFormOpen] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // Traemos el conjunto completo (búsqueda + solo-mías) y filtramos por tipo/rubro
  // del lado del cliente para poder mostrar los contadores por tipo.
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['contacts', { q: debounced, onlyMine }],
    queryFn: () =>
      contactsApi.list({
        q: debounced || undefined,
        assigned_user_id: onlyMine ? selfId : undefined,
        limit: 1000,
      }),
  })

  const industriesQ = useQuery({ queryKey: ['industries'], queryFn: () => industriesApi.list() })

  // Filtro por rubro aplicado antes de contar por tipo.
  const byIndustry = useMemo(
    () => (data ?? []).filter((c) => !industry || c.industry === industry),
    [data, industry],
  )

  const counts = useMemo(() => {
    const c: Record<string, number> = { '': byIndustry.length }
    for (const t of kindTabs) if (t.value) c[t.value] = 0
    for (const ct of byIndustry) for (const k of ct.kind) if (k in c) c[k] += 1
    return c
  }, [byIndustry])

  const rows = useMemo(
    () => byIndustry.filter((c) => !kind || c.kind.includes(kind)),
    [byIndustry, kind],
  )

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
    { key: 'industry', header: 'Rubro', render: (c) => c.industry || '—' },
    { key: 'city', header: 'Localidad', render: (c) => c.city || '—' },
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

      {/* Toolbar de filtros */}
      <div className="space-y-3 rounded-xl border border-border bg-surface p-3">
        <div className="flex flex-wrap items-center gap-3">
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
          <div className="w-52">
            <Select
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              options={[
                { value: '', label: 'Todos los rubros' },
                ...(industriesQ.data ?? []).map((i) => ({ value: i.name, label: i.name })),
              ]}
              aria-label="Filtrar por rubro"
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-text whitespace-nowrap">
            <input
              type="checkbox"
              checked={onlyMine}
              onChange={(e) => setOnlyMine(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-brand"
            />
            Solo mías
          </label>
        </div>

        {/* Chips por tipo con contador */}
        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          {kindTabs.map((t) => {
            const active = kind === t.value
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setKind(t.value)}
                className={
                  'flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ' +
                  (active
                    ? 'border-brand bg-brand text-white shadow-sm'
                    : 'border-border bg-surface-subtle text-text-secondary hover:border-brand/50 hover:text-text')
                }
              >
                {t.label}
                <span
                  className={
                    'min-w-[1.25rem] rounded-full px-1.5 text-center text-xs font-semibold ' +
                    (active ? 'bg-white/25 text-white' : 'bg-surface text-text-tertiary')
                  }
                >
                  {counts[t.value] ?? 0}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {isError ? (
        <ErrorState message="No pudimos cargar los contactos." onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
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
