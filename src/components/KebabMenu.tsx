"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

/**
 * Menú "⋮" con acciones (Editar / Eliminar). Frena la propagación para no
 * disparar drag&drop u otros handlers del contenedor.
 *
 * El desplegable se renderiza en un portal con posición fija (anclado al botón),
 * así ningún ancestro con `overflow-hidden` o `transform` lo recorta —problema
 * típico en las vistas de lista. Se cierra al hacer click afuera o al scrollear.
 */
export function KebabMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()

  function place() {
    const rect = btnRef.current?.getBoundingClientRect()
    if (rect) setCoords({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
  }

  function toggle(e: React.SyntheticEvent) {
    stop(e)
    if (!open) place()
    setOpen((o) => !o)
  }

  // Mientras está abierto, cerrarlo si se scrollea o cambia el tamaño (el menú
  // fijo quedaría "flotando" desanclado del botón).
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener("scroll", close, true)
    window.addEventListener("resize", close)
    return () => {
      window.removeEventListener("scroll", close, true)
      window.removeEventListener("resize", close)
    }
  }, [open])

  return (
    <div className="relative" onPointerDown={stop}>
      <button
        ref={btnRef}
        type="button"
        aria-label="Acciones"
        onClick={toggle}
        className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-black/[.05] hover:text-zinc-700 dark:hover:bg-white/[.08] dark:hover:text-zinc-200"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
        </svg>
      </button>
      {open && coords
        ? createPortal(
            <>
              <button
                type="button"
                aria-label="Cerrar menú"
                className="fixed inset-0 z-40 cursor-default"
                onClick={() => setOpen(false)}
                onPointerDown={stop}
              />
              <div
                className="fixed z-50 w-36 overflow-hidden rounded-md border border-black/[.08] bg-white py-1 text-sm shadow-lg dark:border-white/[.12] dark:bg-zinc-900"
                style={{ top: coords.top, right: coords.right }}
                onPointerDown={stop}
              >
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
            </>,
            document.body,
          )
        : null}
    </div>
  )
}
