import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { contactsApi } from '../../lib/api/contacts'

interface ContactPickerProps {
  label?: string
  value?: string
  onChange: (id: string, fantasyName?: string) => void
  error?: string
  required?: boolean
}

// ContactPicker is a debounced search + select for choosing a contact by name.
// There's no autocomplete widget in the kit, so this is a search box + result list.
export function ContactPicker({ label, value, onChange, error, required }: ContactPickerProps) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300)
    return () => clearTimeout(t)
  }, [query])

  const { data } = useQuery({
    queryKey: ['contacts', 'picker', debounced],
    queryFn: () => contactsApi.list({ q: debounced || undefined, limit: 8 }),
    enabled: open,
  })

  // Resolve current value's name for display.
  const { data: selected } = useQuery({
    queryKey: ['contact', value],
    queryFn: () => contactsApi.get(value!),
    enabled: !!value,
  })

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-sm font-medium text-text">
          {label}
          {required && <span className="text-danger"> *</span>}
        </label>
      )}
      {value && selected ? (
        <div className="flex items-center justify-between rounded border border-border bg-surface px-3 py-2">
          <span className="text-sm text-text">{selected.fantasy_name}</span>
          <button
            type="button"
            onClick={() => {
              onChange('', '')
              setOpen(true)
            }}
            className="text-xs text-text-secondary hover:text-text"
          >
            Cambiar
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            placeholder="Buscar contacto…"
            className="h-10 w-full rounded border border-border bg-surface pl-9 pr-3 text-base text-text placeholder:text-text-tertiary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
          {open && (data?.length ?? 0) > 0 && (
            <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded border border-border bg-surface-overlay shadow-overlay">
              {data!.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(c.id, c.fantasy_name)
                      setOpen(false)
                      setQuery('')
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-text hover:bg-surface-raised"
                  >
                    {c.fantasy_name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}
