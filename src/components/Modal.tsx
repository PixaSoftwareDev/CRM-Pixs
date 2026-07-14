"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"

/**
 * Modal centrado con overlay. Cierra con Escape, click en el fondo o la "✕".
 * El que lo usa controla el montaje ({open && <Modal .../>}); acá va la
 * animación de entrada y el bloqueo del scroll del body.
 *
 * Se renderiza vía portal en <body> para que ningún ancestro con `overflow`
 * o `transform` (p. ej. listas con overflow-hidden) lo recorte o reubique.
 */
export function Modal({
  title,
  description,
  onClose,
  children,
  className,
}: {
  title: string
  description?: string
  onClose: () => void
  children: React.ReactNode
  className?: string
}) {
  const [shown, setShown] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    // Un tick después de montar para disparar la transición de entrada.
    const raf = requestAnimationFrame(() => setShown(true))
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <button
        type="button"
        aria-label="Cerrar"
        tabIndex={-1}
        onClick={onClose}
        className={cn(
          "fixed inset-0 cursor-default bg-black/50 backdrop-blur-sm transition-opacity duration-200",
          shown ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative z-10 my-auto w-full max-w-lg rounded-2xl border border-black/[.08] bg-white shadow-2xl transition-all duration-200 dark:border-white/[.12] dark:bg-zinc-950",
          shown ? "translate-y-0 scale-100 opacity-100" : "translate-y-3 scale-[0.98] opacity-0",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-black/[.06] px-6 py-4 dark:border-white/[.08]">
          <div>
            <h2 className="text-base font-semibold tracking-tight">{title}</h2>
            {description ? <p className="mt-0.5 text-sm text-zinc-500">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-1.5 -mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-black/[.05] hover:text-zinc-700 dark:hover:bg-white/[.08] dark:hover:text-zinc-200"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
