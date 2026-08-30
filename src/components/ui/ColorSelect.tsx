"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

export type ColorOption = {
  value: string
  label: string
  /** Clase de fondo del punto (ej: "bg-red-500"). Sin ella, punto gris. */
  dot?: string
}

/**
 * Desplegable propio, no nativo: hace falta para poder mostrar un punto de
 * color en cada opción (un `<option>` del navegador solo admite texto).
 * Se cierra al hacer clic afuera o con Escape.
 */
export function ColorSelect({
  value,
  onChange,
  options,
  className,
  ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  options: ColorOption[]
  className?: string
  ariaLabel?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const elegida = options.find((o) => o.value === value) ?? options[0]

  useEffect(() => {
    if (!abierto) return
    function alClickear(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setAbierto(false)
    }
    function alTeclear(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false)
    }
    document.addEventListener("mousedown", alClickear)
    document.addEventListener("keydown", alTeclear)
    return () => {
      document.removeEventListener("mousedown", alClickear)
      document.removeEventListener("keydown", alTeclear)
    }
  }, [abierto])

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={ariaLabel}
        className="flex h-9 w-full items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-left text-sm text-zinc-900 outline-none transition-colors focus:border-blue-700 focus:ring-2 focus:ring-blue-700/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-blue-500"
      >
        <Punto clase={elegida?.dot} />
        <span className="flex-1 truncate">{elegida?.label}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={cn("shrink-0 text-zinc-400 transition-transform", abierto && "rotate-180")}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {abierto ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-black/[.10] bg-white py-1 shadow-lg dark:border-white/[.14] dark:bg-zinc-900">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value)
                setAbierto(false)
              }}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors",
                o.value === value
                  ? "bg-black/[.05] font-medium dark:bg-white/[.08]"
                  : "hover:bg-black/[.04] dark:hover:bg-white/[.06]",
              )}
            >
              <Punto clase={o.dot} />
              {o.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function Punto({ clase }: { clase?: string }) {
  if (clase === undefined) return null
  return (
    <span
      aria-hidden="true"
      className={cn("h-2.5 w-2.5 shrink-0 rounded-full", clase ?? "bg-zinc-300 dark:bg-zinc-600")}
    />
  )
}
