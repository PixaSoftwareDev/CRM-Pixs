"use client"

import { cn } from "@/lib/utils"

export type ViewOption<T extends string> = {
  value: T
  label: string
  icon: React.ReactNode
}

/**
 * Control segmentado de vista (ej. Tarjetas/Lista, Tablero/Lista).
 * Único en toda la app para que se vea igual en cada pantalla.
 * En móvil muestra solo el ícono; desde `sm` agrega la etiqueta.
 */
export function ViewToggle<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: ViewOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div
      className={cn(
        "inline-flex rounded-lg border border-black/[.08] p-0.5 dark:border-white/[.12]",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            title={o.label}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-colors",
              active
                ? "bg-zinc-900 text-white shadow-sm dark:bg-white dark:text-zinc-900"
                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200",
            )}
          >
            {o.icon}
            <span className="hidden sm:inline">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}
