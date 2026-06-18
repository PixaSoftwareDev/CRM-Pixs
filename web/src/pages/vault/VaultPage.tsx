import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Shield, Plus, Eye, EyeOff, Copy, ExternalLink, Pencil, Trash2, Check } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { SlideOver } from '../../components/ui/SlideOver'
import { Modal } from '../../components/ui/Modal'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { Skeleton } from '../../components/ui/Skeleton'
import { useUIStore } from '../../stores/ui'
import { cn } from '../../lib/utils'
import {
  vaultApi,
  VAULT_CATEGORY_LABELS,
  type VaultEntry,
  type VaultCategory,
  type CreateVaultEntryInput,
} from '../../lib/api/vault'

const ALL_CATEGORIES: VaultCategory[] = [
  'credencial',
  'api_key',
  'servidor',
  'base_datos',
  'correo',
  'certificado',
  'general',
]

const CATEGORY_COLORS: Record<VaultCategory, string> = {
  credencial: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  api_key: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  servidor: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  base_datos: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  correo: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
  certificado: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  general: 'bg-surface-raised text-text-secondary',
}

const categoryOptions = [
  { value: '', label: 'Todas las categorías' },
  ...ALL_CATEGORIES.map((c) => ({ value: c, label: VAULT_CATEGORY_LABELS[c] })),
]

const categoryFormOptions = ALL_CATEGORIES.map((c) => ({
  value: c,
  label: VAULT_CATEGORY_LABELS[c],
}))

// ─── EntryCard ────────────────────────────────────────────────────────────────

interface EntryCardProps {
  entry: VaultEntry
  onEdit: (entry: VaultEntry) => void
  onDelete: (entry: VaultEntry) => void
}

function EntryCard({ entry, onEdit, onDelete }: EntryCardProps) {
  const [revealed, setRevealed] = useState(false)
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState<'username' | 'secret' | 'url' | null>(null)
  const toast = useUIStore((s) => s.toast)

  const handleReveal = async () => {
    if (revealed) {
      setRevealed(false)
      setRevealedSecret(null)
      return
    }
    setLoading(true)
    try {
      const full = await vaultApi.get(entry.id)
      setRevealedSecret(full.secret ?? null)
      setRevealed(true)
    } catch {
      toast.error('No se pudo obtener la clave')
    } finally {
      setLoading(false)
    }
  }

  const copy = async (text: string, field: 'username' | 'secret' | 'url') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(field)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4 flex flex-col gap-3 hover:border-brand/40 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
              CATEGORY_COLORS[entry.category],
            )}
          >
            {VAULT_CATEGORY_LABELS[entry.category]}
          </span>
          <span className="font-semibold text-text truncate">{entry.label}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onEdit(entry)}
            className="rounded-lg p-1.5 text-text-tertiary hover:bg-surface-raised hover:text-text transition-colors"
            title="Editar"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => onDelete(entry)}
            className="rounded-lg p-1.5 text-text-tertiary hover:bg-danger/10 hover:text-danger transition-colors"
            title="Eliminar"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Fields */}
      <div className="flex flex-col gap-2 text-sm">
        {entry.username && (
          <div className="flex items-center gap-2">
            <span className="text-text-tertiary w-20 shrink-0">Usuario</span>
            <span className="text-text font-mono flex-1 truncate">{entry.username}</span>
            <button
              onClick={() => copy(entry.username!, 'username')}
              className="shrink-0 text-text-tertiary hover:text-brand transition-colors"
              title="Copiar usuario"
            >
              {copied === 'username' ? <Check size={13} className="text-success" /> : <Copy size={13} />}
            </button>
          </div>
        )}

        {entry.has_secret && (
          <div className="flex items-center gap-2">
            <span className="text-text-tertiary w-20 shrink-0">Contraseña</span>
            <span className="text-text font-mono flex-1 truncate">
              {revealed && revealedSecret != null ? revealedSecret : '••••••••••••'}
            </span>
            <div className="shrink-0 flex items-center gap-1">
              {revealed && revealedSecret && (
                <button
                  onClick={() => copy(revealedSecret, 'secret')}
                  className="text-text-tertiary hover:text-brand transition-colors"
                  title="Copiar contraseña"
                >
                  {copied === 'secret' ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                </button>
              )}
              <button
                onClick={handleReveal}
                disabled={loading}
                className="text-text-tertiary hover:text-brand transition-colors disabled:opacity-50"
                title={revealed ? 'Ocultar' : 'Mostrar'}
              >
                {loading ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand border-t-transparent inline-block" />
                ) : revealed ? (
                  <EyeOff size={13} />
                ) : (
                  <Eye size={13} />
                )}
              </button>
            </div>
          </div>
        )}

        {entry.url && (
          <div className="flex items-center gap-2">
            <span className="text-text-tertiary w-20 shrink-0">URL</span>
            <a
              href={entry.url}
              target="_blank"
              rel="noreferrer"
              className="text-brand hover:underline flex-1 truncate flex items-center gap-1"
            >
              <span className="truncate">{entry.url}</span>
              <ExternalLink size={11} className="shrink-0" />
            </a>
            <button
              onClick={() => copy(entry.url!, 'url')}
              className="shrink-0 text-text-tertiary hover:text-brand transition-colors"
              title="Copiar URL"
            >
              {copied === 'url' ? <Check size={13} className="text-success" /> : <Copy size={13} />}
            </button>
          </div>
        )}

        {entry.notes && (
          <div className="flex items-start gap-2">
            <span className="text-text-tertiary w-20 shrink-0 pt-0.5">Notas</span>
            <span className="text-text-secondary flex-1 whitespace-pre-wrap break-words">{entry.notes}</span>
          </div>
        )}

        {entry.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {entry.tags.map((t) => (
              <span
                key={t}
                className="rounded-full bg-surface-raised px-2 py-0.5 text-xs text-text-secondary"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── EntryForm ────────────────────────────────────────────────────────────────

interface EntryFormState {
  category: VaultCategory
  label: string
  username: string
  secret: string
  url: string
  notes: string
  tags: string
}

const EMPTY_FORM: EntryFormState = {
  category: 'general',
  label: '',
  username: '',
  secret: '',
  url: '',
  notes: '',
  tags: '',
}

interface EntryFormProps {
  open: boolean
  onClose: () => void
  editing: VaultEntry | null
  onSaved: () => void
}

function EntryForm({ open, onClose, editing, onSaved }: EntryFormProps) {
  const [form, setForm] = useState<EntryFormState>(EMPTY_FORM)
  const [showSecret, setShowSecret] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useUIStore((s) => s.toast)

  useEffect(() => {
    if (!open) return
    setShowSecret(false)
    setError(null)
    setSaving(false)
    if (editing) {
      setForm({
        category: editing.category,
        label: editing.label,
        username: editing.username ?? '',
        secret: '',
        url: editing.url ?? '',
        notes: editing.notes ?? '',
        tags: (editing.tags ?? []).join(', '),
      })
    } else {
      setForm(EMPTY_FORM)
    }
  }, [open, editing?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (field: keyof EntryFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.label.trim()) {
      setError('El nombre de la entrada es obligatorio')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const tags = form.tags.split(',').map((t) => t.trim()).filter(Boolean)
      const payload: CreateVaultEntryInput = {
        category: form.category,
        label: form.label.trim(),
        username: form.username.trim() || undefined,
        secret: form.secret || undefined,
        url: form.url.trim() || undefined,
        notes: form.notes.trim() || undefined,
        tags,
      }
      if (editing) {
        await vaultApi.update(editing.id, payload)
        toast.success('Entrada actualizada')
      } else {
        await vaultApi.create(payload)
        toast.success('Entrada creada')
      }
      onSaved()
      onClose()
    } catch {
      setError('No se pudo guardar la entrada')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={editing ? 'Editar entrada' : 'Nueva entrada'}
      size="md"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 h-full">
        <div className="flex-1 flex flex-col gap-4 overflow-y-auto">
          <Select
            label="Categoría"
            value={form.category}
            onChange={set('category')}
            options={categoryFormOptions}
          />

          <Input
            label="Nombre *"
            value={form.label}
            onChange={set('label')}
            placeholder="Ej: VPS producción, API Stripe"
            required
          />

          <Input
            label="Usuario"
            value={form.username}
            onChange={set('username')}
            placeholder="usuario, email o ID"
            autoComplete="off"
          />

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-text-secondary">
              {editing ? 'Contraseña (dejá vacío para no cambiar)' : 'Contraseña / Secreto'}
            </label>
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                value={form.secret}
                onChange={set('secret')}
                placeholder={editing ? '••••••••' : 'contraseña, token o clave'}
                autoComplete="new-password"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 pr-10 text-sm text-text placeholder:text-text-tertiary focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
              <button
                type="button"
                onClick={() => setShowSecret((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text transition-colors"
              >
                {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <Input
            label="URL"
            type="url"
            value={form.url}
            onChange={set('url')}
            placeholder="https://..."
          />

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-text-secondary">Notas</label>
            <textarea
              value={form.notes}
              onChange={set('notes')}
              rows={3}
              placeholder="Información adicional, instrucciones..."
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-tertiary focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand resize-none"
            />
          </div>

          <Input
            label="Tags (separados por coma)"
            value={form.tags}
            onChange={set('tags')}
            placeholder="producción, render, backend"
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            {editing ? 'Guardar cambios' : 'Crear entrada'}
          </Button>
        </div>
      </form>
    </SlideOver>
  )
}

// ─── DeleteConfirm ────────────────────────────────────────────────────────────

interface DeleteConfirmProps {
  entry: VaultEntry | null
  onClose: () => void
  onDeleted: () => void
}

function DeleteConfirm({ entry, onClose, onDeleted }: DeleteConfirmProps) {
  const [deleting, setDeleting] = useState(false)
  const toast = useUIStore((s) => s.toast)

  const handleDelete = async () => {
    if (!entry) return
    setDeleting(true)
    try {
      await vaultApi.delete(entry.id)
      toast.success('Entrada eliminada')
      onDeleted()
      onClose()
    } catch {
      toast.error('No se pudo eliminar la entrada')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Modal open={!!entry} onClose={onClose} title="Eliminar entrada" size="sm">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-secondary">
          ¿Eliminás la entrada{' '}
          <span className="font-semibold text-text">"{entry?.label}"</span>? Esta acción no se puede
          deshacer.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" loading={deleting} onClick={handleDelete}>
            Eliminar
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── VaultPage ────────────────────────────────────────────────────────────────

export function VaultPage() {
  const [categoryFilter, setCategoryFilter] = useState<VaultCategory | ''>('')
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<VaultEntry | null>(null)
  const [deletingEntry, setDeletingEntry] = useState<VaultEntry | null>(null)
  const queryClient = useQueryClient()

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['vault', categoryFilter],
    queryFn: () => vaultApi.list(categoryFilter || undefined),
  })

  const entries = (data ?? []).filter((e) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      e.label.toLowerCase().includes(q) ||
      (e.username ?? '').toLowerCase().includes(q) ||
      (e.url ?? '').toLowerCase().includes(q) ||
      (e.notes ?? '').toLowerCase().includes(q) ||
      e.tags.some((t) => t.toLowerCase().includes(q))
    )
  })

  const handleEdit = (entry: VaultEntry) => {
    setEditingEntry(entry)
    setFormOpen(true)
  }

  const handleFormClose = () => {
    setFormOpen(false)
    setTimeout(() => setEditingEntry(null), 300)
  }

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['vault'] })

  if (isError) {
    return <ErrorState message="No se pudo cargar el vault" onRetry={refetch} />
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10 text-brand">
            <Shield size={18} />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-text">Vault</h1>
            <p className="text-xs text-text-tertiary">Credenciales y datos sensibles cifrados</p>
          </div>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            setEditingEntry(null)
            setFormOpen(true)
          }}
        >
          <Plus size={14} />
          Nueva entrada
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          placeholder="Buscar por nombre, usuario, URL, tags..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as VaultCategory | '')}
          options={categoryOptions}
          className="sm:w-52"
        />
      </div>

      {/* Category chips */}
      {!categoryFilter && !search && !isLoading && entries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {ALL_CATEGORIES.filter((c) => entries.some((e) => e.category === c)).map((c) => {
            const count = entries.filter((e) => e.category === c).length
            return (
              <button
                key={c}
                onClick={() => setCategoryFilter(c)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  CATEGORY_COLORS[c],
                  'hover:opacity-80',
                )}
              >
                {VAULT_CATEGORY_LABELS[c]} · {count}
              </button>
            )
          })}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<Shield size={32} />}
          title={search || categoryFilter ? 'Sin resultados' : 'Vault vacío'}
          description={
            search || categoryFilter
              ? 'Probá con otros filtros'
              : 'Guardá contraseñas, tokens y datos de acceso de forma segura'
          }
          action={
            !search && !categoryFilter
              ? {
                  label: 'Agregar primera entrada',
                  onClick: () => setFormOpen(true),
                }
              : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              onEdit={handleEdit}
              onDelete={setDeletingEntry}
            />
          ))}
        </div>
      )}

      <EntryForm
        open={formOpen}
        onClose={handleFormClose}
        editing={editingEntry}
        onSaved={invalidate}
      />

      <DeleteConfirm
        entry={deletingEntry}
        onClose={() => setDeletingEntry(null)}
        onDeleted={invalidate}
      />
    </div>
  )
}
