"use client"

import { useDroppable } from "@dnd-kit/core"
import { cn } from "@/lib/utils"

/** Estilo base de una tarjeta de kanban, compartido por todos los tableros. */
export const KANBAN_CARD =
  "rounded-lg border border-black/[.08] bg-white p-3 text-sm shadow-sm transition-shadow dark:border-white/[.12] dark:bg-zinc-900"

/** Contenedor de las columnas: scroll horizontal en pantallas chicas. */
export function KanbanBoardShell({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-3 overflow-x-auto pb-4">{children}</div>
}

/**
 * Columna droppable de kanban. Idéntica en Oportunidades, Proyecto y Tareas.
 * `header` es el encabezado (badge o texto); `footer` opcional (ej. total).
 */
export function KanbanColumn({
  id,
  header,
  count,
  footer,
  children,
}: {
  id: string
  header: React.ReactNode
  count: number
  footer?: React.ReactNode
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div className="flex min-w-[13rem] flex-1 flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        {header}
        <span className="text-xs text-zinc-400">{count}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-32 flex-1 flex-col gap-2 rounded-xl bg-zinc-100/60 p-2 transition-colors dark:bg-zinc-900/40",
          isOver && "bg-zinc-200/70 ring-2 ring-zinc-300 dark:bg-zinc-800/60 dark:ring-zinc-600",
        )}
      >
        {children}
      </div>
      {footer ? <div className="mt-1 px-1 text-right text-xs text-zinc-400">{footer}</div> : null}
    </div>
  )
}
