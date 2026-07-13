import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react"
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
        variant === "primary" &&
          "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200",
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
        "h-9 w-full rounded-md border border-zinc-300 bg-transparent px-3 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700",
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
        "w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700",
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
        "h-9 w-full rounded-md border border-zinc-300 bg-transparent px-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700",
        className,
      )}
      {...props}
    />
  )
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
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
