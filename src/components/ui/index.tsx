import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react"
import { SearchIcon } from "@/components/icons"
import { cn } from "@/lib/utils"

// Primitivas mínimas estilo shadcn/ui, propias y auto-contenidas (§1 del plan).

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger"
  size?: "sm" | "md"
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:opacity-60 disabled:pointer-events-none",
        size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-4 text-sm",
        // Degradé azul → celeste, contenido: da color sin gritar.
        variant === "primary" &&
          "bg-gradient-to-r from-blue-700 to-sky-700 text-white shadow-sm shadow-blue-900/10 hover:from-blue-800 hover:to-sky-800",
        variant === "secondary" &&
          "border border-zinc-300 hover:bg-black/[.04] dark:border-zinc-700 dark:hover:bg-white/[.06]",
        variant === "ghost" && "hover:bg-black/[.04] dark:hover:bg-white/[.06]",
        variant === "danger" && "bg-red-600 text-white hover:bg-red-500",
        className,
      )}
      {...props}
    />
  )
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-md border border-zinc-300 bg-transparent px-3 text-sm outline-none transition-colors focus:border-blue-700 focus:ring-2 focus:ring-blue-700/10 dark:border-zinc-700 dark:focus:border-blue-500",
        className,
      )}
      {...props}
    />
  )
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-blue-700 focus:ring-2 focus:ring-blue-700/10 dark:border-zinc-700 dark:focus:border-blue-500",
        className,
      )}
      {...props}
    />
  )
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        // bg/text explícitos: en oscuro, transparente dejaba el menú de opciones ilegible.
        "h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 outline-none transition-colors focus:border-blue-700 focus:ring-2 focus:ring-blue-700/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-blue-500",
        className,
      )}
      {...props}
    />
  )
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  // biome-ignore lint/a11y/noLabelWithoutControl: primitiva genérica, el control lo asocia quien la usa (htmlFor)
  return <label className={cn("text-sm font-medium", className)} {...props} />
}

export function Field({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: el control viene en children, envuelto por el label
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  )
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-black/[.08] bg-white p-5 dark:border-white/[.12] dark:bg-zinc-950",
        className,
      )}
      {...props}
    />
  )
}

const BADGE_TONES: Record<string, string> = {
  neutral: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  green: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  red: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
}

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof BADGE_TONES }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        BADGE_TONES[tone],
        className,
      )}
      {...props}
    />
  )
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {subtitle ? <p className="text-sm text-zinc-500">{subtitle}</p> : null}
    </header>
  )
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-black/[.12] p-10 text-center text-sm text-zinc-500 dark:border-white/[.14]">
      {children}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   Controles de listado, compartidos por todas las secciones.

   La idea: que Clientes, Proyectos, Tareas, Infra, Accesos y Finanzas usen
   exactamente las mismas piezas para navegar y filtrar, en vez de que cada
   pantalla invente su propia barra.
   ──────────────────────────────────────────────────────────────────────────── */

/** Fila de pestañas con línea inferior. Envuelve varios <Tab>. */
export function Tabs({
  children,
  acciones,
  className,
}: {
  children: React.ReactNode
  /** Lo que va a la derecha: contador, botón de filtros, etc. */
  acciones?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        // flex-wrap: si las acciones no entran al lado de las pestañas
        // (pantallas angostas), bajan de línea en vez de desbordar la página.
        "flex flex-wrap items-center justify-between gap-x-4 border-b border-black/[.08] dark:border-white/[.12]",
        className,
      )}
    >
      {/* Sin scroll interno: si las pestañas no entran (pantallas muy angostas),
          bajan de línea; cada una mantiene su texto entero en una línea. */}
      <nav className="flex max-w-full flex-wrap gap-x-4 sm:shrink-0 sm:gap-x-6">{children}</nav>
      {acciones ? (
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 py-1.5">
          {acciones}
        </div>
      ) : null}
    </div>
  )
}

/** Pestaña: la activa se marca con la línea, no con un fondo. */
export function Tab({
  activa,
  onClick,
  children,
  badge,
}: {
  activa: boolean
  onClick: () => void
  children: React.ReactNode
  /** Número al lado del nombre (cantidad de elementos). */
  badge?: number | string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={activa ? "page" : undefined}
      className={cn(
        "-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 py-3 text-sm font-medium transition-colors",
        activa
          ? "border-blue-600 text-zinc-900 dark:border-blue-400 dark:text-white"
          : "border-transparent text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white",
      )}
    >
      {children}
      {badge !== undefined ? (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-xs",
            activa
              ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200"
              : "bg-black/[.06] text-zinc-500 dark:bg-white/[.10] dark:text-zinc-300",
          )}
        >
          {badge}
        </span>
      ) : null}
    </button>
  )
}

/** Botón que abre y cierra el panel de filtros. */
export function FilterToggle({
  abierto,
  activo,
  onClick,
}: {
  abierto: boolean
  /** Hay filtros aplicados: el botón queda marcado aunque el panel esté cerrado. */
  activo?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={abierto}
      className={cn(
        "my-2 shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors",
        abierto || activo
          ? "bg-black/[.06] text-zinc-900 dark:bg-white/[.12] dark:text-white"
          : "text-zinc-500 hover:bg-black/[.04] hover:text-zinc-900 dark:hover:bg-white/[.06] dark:hover:text-white",
      )}
    >
      Filtros{activo ? " ·" : ""}
    </button>
  )
}

/** Panel de filtros: la franja que aparece debajo de las pestañas. */
export function FilterPanel({
  children,
  onLimpiar,
}: {
  children: React.ReactNode
  /** Si se pasa, muestra "Limpiar" a la derecha. */
  onLimpiar?: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-black/[.08] bg-zinc-50 px-4 py-3 dark:border-white/[.12] dark:bg-white/[.03]">
      {children}
      {onLimpiar ? (
        <button
          type="button"
          onClick={onLimpiar}
          className="ml-auto text-sm text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline dark:hover:text-white"
        >
          Limpiar
        </button>
      ) : null}
    </div>
  )
}

/** Grupo de botones excluyentes. Reemplaza a los desplegables de pocas opciones. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: readonly { value: T; label: string }[]
  className?: string
}) {
  return (
    <div
      className={cn(
        "inline-flex rounded-md border border-black/[.10] p-0.5 dark:border-white/[.14]",
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded px-3 py-1.5 text-sm font-medium transition-colors",
            value === o.value
              ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
              : "text-zinc-600 hover:bg-black/[.04] dark:text-zinc-300 dark:hover:bg-white/[.08]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Buscador con lupa. El texto guía es siempre el mismo en toda la app. */
export function SearchInput({
  value,
  onChange,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className={cn("relative", className)}>
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
      <input
        {...props}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Buscar…"
        aria-label="Buscar"
        className="h-9 w-56 max-w-full rounded-md border border-black/[.10] bg-white pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-blue-700 focus:ring-2 focus:ring-blue-700/10 dark:border-white/[.14] dark:bg-zinc-900 dark:text-white dark:focus:border-blue-500"
      />
    </div>
  )
}
