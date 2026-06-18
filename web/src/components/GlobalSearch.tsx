import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, Users, Zap, X } from 'lucide-react'
import { adminApi } from '../lib/api/admin'

interface Props {
  open: boolean
  onClose: () => void
}

export function GlobalSearch({ open, onClose }: Props) {
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const { data } = useQuery({
    queryKey: ['global-search', q],
    queryFn: () => adminApi.search(q),
    enabled: q.trim().length >= 2,
    staleTime: 10_000,
  })

  const contacts = data?.contacts ?? []
  const leads = data?.leads ?? []

  type Item = { id: string; label: string; sublabel?: string; href: string; kind: 'contact' | 'lead' }

  const items: Item[] = [
    ...contacts.map((c) => ({
      id: c.id,
      label: c.fantasy_name,
      sublabel: c.kind?.join(', '),
      href: `/contactos/${c.id}`,
      kind: 'contact' as const,
    })),
    ...leads.map((l) => ({
      id: l.id,
      label: l.company_name,
      sublabel: l.status,
      href: `/leads`,
      kind: 'lead' as const,
    })),
  ]

  useEffect(() => {
    if (open) {
      setQ('')
      setCursor(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    setCursor(0)
  }, [q])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!open) return
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, items.length - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)) }
      if (e.key === 'Enter' && items[cursor]) {
        navigate(items[cursor].href)
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, items, cursor, navigate, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="w-4 h-4 text-text-tertiary flex-shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar contactos, leads..."
            className="flex-1 bg-transparent text-text placeholder:text-text-tertiary focus:outline-none text-sm"
          />
          {q && (
            <button onClick={() => setQ('')} className="text-text-tertiary hover:text-text">
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="text-xs text-text-tertiary border border-border rounded px-1 py-0.5">Esc</kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {q.trim().length < 2 ? (
            <div className="px-4 py-6 text-center text-sm text-text-tertiary">
              Escribí al menos 2 caracteres para buscar
            </div>
          ) : items.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-text-tertiary">
              Sin resultados para "{q}"
            </div>
          ) : (
            <>
              {contacts.length > 0 && (
                <div>
                  <div className="px-4 pt-3 pb-1.5 flex items-center gap-1.5 text-xs font-semibold text-text-tertiary uppercase tracking-wide">
                    <Users className="w-3 h-3" /> Contactos
                  </div>
                  {contacts.map((c, i) => {
                    const idx = i
                    return (
                      <ResultRow
                        key={c.id}
                        label={c.fantasy_name}
                        sublabel={c.kind?.join(', ')}
                        active={cursor === idx}
                        onHover={() => setCursor(idx)}
                        onClick={() => { navigate(`/contactos/${c.id}`); onClose() }}
                      />
                    )
                  })}
                </div>
              )}
              {leads.length > 0 && (
                <div>
                  <div className="px-4 pt-3 pb-1.5 flex items-center gap-1.5 text-xs font-semibold text-text-tertiary uppercase tracking-wide">
                    <Zap className="w-3 h-3" /> Leads
                  </div>
                  {leads.map((l, i) => {
                    const idx = contacts.length + i
                    return (
                      <ResultRow
                        key={l.id}
                        label={l.company_name}
                        sublabel={l.status}
                        active={cursor === idx}
                        onHover={() => setCursor(idx)}
                        onClick={() => { navigate('/leads'); onClose() }}
                      />
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border flex items-center gap-3 text-xs text-text-tertiary">
          <span><kbd className="border border-border rounded px-1">↑↓</kbd> navegar</span>
          <span><kbd className="border border-border rounded px-1">Enter</kbd> abrir</span>
          <span><kbd className="border border-border rounded px-1">Esc</kbd> cerrar</span>
        </div>
      </div>
    </div>
  )
}

function ResultRow({
  label,
  sublabel,
  active,
  onHover,
  onClick,
}: {
  label: string
  sublabel?: string
  active: boolean
  onHover: () => void
  onClick: () => void
}) {
  return (
    <button
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
        active ? 'bg-brand/10' : 'hover:bg-surface-subtle'
      }`}
      onMouseEnter={onHover}
      onClick={onClick}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-text truncate">{label}</p>
        {sublabel && <p className="text-xs text-text-tertiary truncate">{sublabel}</p>}
      </div>
    </button>
  )
}

// ─── Hook for Cmd-K shortcut ──────────────────────────────────────────────────

export function useGlobalSearch() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return { open, setOpen }
}
