import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Tag, LayoutList, AlertCircle, Percent, CreditCard, BookOpen, Globe } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { useUIStore } from '../../stores/ui'
import { useAuthStore } from '../../stores/auth'
import { catalogsApi } from '../../lib/api/catalogs'

// ─── Small inline add form ─────────────────────────────────────────────────────

function AddForm({
  placeholder,
  onAdd,
  withColor = false,
}: {
  placeholder: string
  onAdd: (name: string, color?: string) => Promise<void>
  withColor?: boolean
}) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('#6366f1')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try {
      await onAdd(name.trim(), withColor ? color : undefined)
      setName('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 mt-3">
      {withColor && (
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="w-8 h-8 rounded cursor-pointer border-0 p-0 flex-shrink-0"
          title="Color"
        />
      )}
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={placeholder}
        className="flex-1 min-w-0 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-brand"
      />
      <Button type="submit" variant="primary" size="sm" loading={busy}>
        <Plus className="w-3.5 h-3.5" />
      </Button>
    </form>
  )
}

// ─── Generic catalog card ──────────────────────────────────────────────────────

function CatalogCard({
  title,
  icon,
  items,
  isLoading,
  canManage,
  onAdd,
  renderItem,
  withColor = false,
  addPlaceholder,
  readOnly = false,
}: {
  title: string
  icon: React.ReactNode
  items: { id: string; name: string }[]
  isLoading: boolean
  canManage: boolean
  onAdd?: (name: string, color?: string) => Promise<void>
  renderItem?: (item: { id: string; name: string; color?: string }) => React.ReactNode
  withColor?: boolean
  addPlaceholder: string
  readOnly?: boolean
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-text-secondary">{icon}</span>
        <p className="font-semibold text-text text-sm">{title}</p>
        <span className="ml-auto text-xs text-text-tertiary">{items.length} items</span>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[1, 2].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-text-tertiary">Sin items todavía.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((item) =>
            renderItem ? (
              renderItem(item as { id: string; name: string; color?: string })
            ) : (
              <span
                key={item.id}
                className="text-xs px-2.5 py-1 rounded-full bg-surface-raised border border-border text-text-secondary"
              >
                {item.name}
              </span>
            ),
          )}
        </div>
      )}

      {!readOnly && canManage && onAdd && (
        <AddForm placeholder={addPlaceholder} onAdd={onAdd} withColor={withColor} />
      )}
      {readOnly && (
        <p className="text-xs text-text-tertiary flex items-center gap-1">
          <AlertCircle className="w-3 h-3" /> Configurable sólo en base de datos.
        </p>
      )}
    </div>
  )
}

// ─── CatalogosPage ────────────────────────────────────────────────────────────

export function CatalogosPage() {
  const can = useAuthStore((s) => s.can)
  const toast = useUIStore((s) => s.toast)
  const qc = useQueryClient()
  const canManage = can('users', 'manage')

  const { data: eventTypes = [], isLoading: loadET } = useQuery({
    queryKey: ['catalogs-event-types'],
    queryFn: catalogsApi.eventTypes.list,
  })
  const { data: stages = [], isLoading: loadStages } = useQuery({
    queryKey: ['catalogs-pipeline-stages'],
    queryFn: catalogsApi.pipelineStages.list,
  })
  const { data: lostReasons = [], isLoading: loadLR } = useQuery({
    queryKey: ['catalogs-lost-reasons'],
    queryFn: catalogsApi.lostReasons.list,
  })
  const { data: tags = [], isLoading: loadTags } = useQuery({
    queryKey: ['catalogs-tags'],
    queryFn: catalogsApi.tags.list,
  })
  const { data: vatRates = [], isLoading: loadVAT } = useQuery({
    queryKey: ['catalogs-vat-rates'],
    queryFn: catalogsApi.vatRates.list,
  })
  const { data: paymentConditions = [], isLoading: loadPC } = useQuery({
    queryKey: ['catalogs-payment-conditions'],
    queryFn: catalogsApi.paymentConditions.list,
  })
  const { data: expCats = [], isLoading: loadEC } = useQuery({
    queryKey: ['catalogs-expense-categories'],
    queryFn: catalogsApi.expenseCategories.list,
  })
  const { data: currencies = [], isLoading: loadCurr } = useQuery({
    queryKey: ['catalogs-currencies'],
    queryFn: catalogsApi.currencies.list,
  })

  const addEventType = async (name: string, color?: string) => {
    await catalogsApi.eventTypes.create({ name, color: color ?? '#6366f1' })
    toast.success('Tipo de evento creado')
    qc.invalidateQueries({ queryKey: ['catalogs-event-types'] })
  }
  const addStage = async (name: string, color?: string) => {
    const maxPos = stages.reduce((m, s) => Math.max(m, s.order_pos ?? 0), 0)
    await catalogsApi.pipelineStages.create({ name, color: color ?? '#6366f1', order_pos: maxPos + 1 })
    toast.success('Etapa creada')
    qc.invalidateQueries({ queryKey: ['catalogs-pipeline-stages'] })
  }
  const addLostReason = async (name: string) => {
    await catalogsApi.lostReasons.create({ name })
    toast.success('Razón de pérdida creada')
    qc.invalidateQueries({ queryKey: ['catalogs-lost-reasons'] })
  }
  const addTag = async (name: string, color?: string) => {
    await catalogsApi.tags.create({ name, color })
    toast.success('Etiqueta creada')
    qc.invalidateQueries({ queryKey: ['catalogs-tags'] })
  }
  const addExpCat = async (name: string) => {
    await catalogsApi.expenseCategories.create({ name })
    toast.success('Categoría de gasto creada')
    qc.invalidateQueries({ queryKey: ['catalogs-expense-categories'] })
    qc.invalidateQueries({ queryKey: ['expense-categories'] })
  }

  if (!can('users', 'view')) {
    return <div className="p-6"><p className="text-text-secondary">Sin permiso.</p></div>
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <h1 className="text-2xl font-semibold text-text">Catálogos</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CatalogCard
          title="Tipos de evento"
          icon={<LayoutList className="w-4 h-4" />}
          items={eventTypes}
          isLoading={loadET}
          canManage={canManage}
          onAdd={addEventType}
          withColor
          addPlaceholder="Nombre del tipo de evento..."
          renderItem={(item) => (
            <span
              key={item.id}
              className="text-xs px-2.5 py-1 rounded-full border font-medium"
              style={{ borderColor: item.color, color: item.color, backgroundColor: item.color + '20' }}
            >
              {item.name}
            </span>
          )}
        />

        <CatalogCard
          title="Etapas de pipeline"
          icon={<LayoutList className="w-4 h-4" />}
          items={stages}
          isLoading={loadStages}
          canManage={canManage}
          onAdd={addStage}
          withColor
          addPlaceholder="Nombre de la etapa..."
          renderItem={(item) => (
            <span
              key={item.id}
              className="text-xs px-2.5 py-1 rounded-full border font-medium"
              style={{ borderColor: item.color, color: item.color, backgroundColor: item.color + '20' }}
            >
              {item.name}
            </span>
          )}
        />

        <CatalogCard
          title="Razones de pérdida"
          icon={<AlertCircle className="w-4 h-4" />}
          items={lostReasons}
          isLoading={loadLR}
          canManage={canManage}
          onAdd={addLostReason}
          addPlaceholder="Ej: Precio, Competencia..."
        />

        <CatalogCard
          title="Etiquetas"
          icon={<Tag className="w-4 h-4" />}
          items={tags}
          isLoading={loadTags}
          canManage={canManage}
          onAdd={addTag}
          withColor
          addPlaceholder="Nombre de la etiqueta..."
          renderItem={(item) => (
            <span
              key={item.id}
              className="text-xs px-2.5 py-1 rounded-full border"
              style={
                item.color
                  ? { borderColor: item.color, color: item.color, backgroundColor: item.color + '20' }
                  : undefined
              }
            >
              {item.name}
            </span>
          )}
        />

        <CatalogCard
          title="Tasas de IVA"
          icon={<Percent className="w-4 h-4" />}
          items={vatRates}
          isLoading={loadVAT}
          canManage={canManage}
          addPlaceholder=""
          readOnly
        />

        <CatalogCard
          title="Condiciones de pago"
          icon={<CreditCard className="w-4 h-4" />}
          items={paymentConditions}
          isLoading={loadPC}
          canManage={canManage}
          addPlaceholder=""
          readOnly
        />

        <CatalogCard
          title="Categorías de gasto"
          icon={<BookOpen className="w-4 h-4" />}
          items={expCats}
          isLoading={loadEC}
          canManage={canManage}
          addPlaceholder="Nueva categoría (ej. Marketing)"
          onAdd={addExpCat}
        />

        <CatalogCard
          title="Monedas"
          icon={<Globe className="w-4 h-4" />}
          items={(currencies as { code: string; name: string }[]).map((c) => ({ id: c.code, name: `${c.code} — ${c.name}` }))}
          isLoading={loadCurr}
          canManage={canManage}
          addPlaceholder=""
          readOnly
        />
      </div>
    </div>
  )
}
