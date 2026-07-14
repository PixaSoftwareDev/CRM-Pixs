"use client"

import { useState } from "react"

/**
 * Menú "⋮" con acciones (Editar / Eliminar). Frena la propagación para no
 * disparar drag&drop u otros handlers del contenedor.
 */
export function KebabMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()

  return (
    <div className="relative" onPointerDown={stop}>
      <button
        type="button"
        aria-label="Acciones"
        onClick={(e) => {
          stop(e)
          setOpen((o) => !o)
        }}
        className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-black/[.05] hover:text-zinc-700 dark:hover:bg-white/[.08] dark:hover:text-zinc-200"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
        </svg>
      </button>
      {open ? (
        <>
          <button
            type="button"
            aria-label="Cerrar menú"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
            onPointerDown={stop}
          />
          <div className="absolute right-0 top-7 z-20 w-36 overflow-hidden rounded-md border border-black/[.08] bg-white py-1 text-sm shadow-lg dark:border-white/[.12] dark:bg-zinc-900">
            <button
              type="button"
              onClick={(e) => {
                stop(e)
                setOpen(false)
                onEdit()
              }}
              className="block w-full px-3 py-1.5 text-left hover:bg-black/[.04] dark:hover:bg-white/[.06]"
            >
              Editar
            </button>
            <button
              type="button"
              onClick={(e) => {
                stop(e)
                setOpen(false)
                onDelete()
              }}
              className="block w-full px-3 py-1.5 text-left text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              Eliminar
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}
