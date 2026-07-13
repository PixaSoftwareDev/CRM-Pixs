"use client"

import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import Link from "next/link"
import { useId, useState, useTransition } from "react"
import { Badge } from "@/components/ui"
import { OPPORTUNITY_STATES, type OpportunityState } from "@/db/schema"
import { cn, formatMoney } from "@/lib/utils"
import { moveOpportunityAction } from "@/modules/opportunities/actions"
import { STATE_LABELS, STATE_TONES } from "@/modules/opportunities/labels"
import type { OpportunityWithContact } from "@/modules/opportunities/queries"

function Card({ opp }: { opp: OpportunityWithContact }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: opp.id })
  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      className={cn(
        "cursor-grab rounded-lg border border-black/[.08] bg-white p-3 text-sm shadow-sm dark:border-white/[.12] dark:bg-zinc-900",
        isDragging && "opacity-50",
      )}
      {...listeners}
      {...attributes}
    >
      <Link
        href={`/pipeline/${opp.id}`}
        className="font-medium hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {opp.titulo}
      </Link>
      <div className="mt-1 text-xs text-zinc-500">
        {opp.contactoNombre}
        {opp.empresa ? ` · ${opp.empresa}` : ""}
      </div>
      {opp.valorEstimado ? (
        <div className="mt-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
          {formatMoney(opp.valorEstimado, opp.moneda)}
        </div>
      ) : null}
    </div>
  )
}

function Column({ estado, items }: { estado: OpportunityState; items: OpportunityWithContact[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: estado })
  const total = items.reduce((s, o) => s + Number(o.valorEstimado ?? 0), 0)
  return (
    <div className="flex min-w-[13rem] flex-1 flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <Badge tone={STATE_TONES[estado]}>{STATE_LABELS[estado]}</Badge>
        <span className="text-xs text-zinc-400">{items.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-32 flex-1 flex-col gap-2 rounded-lg bg-zinc-100/60 p-2 dark:bg-zinc-900/40",
          isOver && "ring-2 ring-zinc-400",
        )}
      >
        {items.map((o) => (
          <Card key={o.id} opp={o} />
        ))}
      </div>
      {total > 0 ? (
        <div className="mt-1 px-1 text-right text-xs text-zinc-400">{formatMoney(total)}</div>
      ) : null}
    </div>
  )
}

export function KanbanBoard({ initial }: { initial: OpportunityWithContact[] }) {
  const [items, setItems] = useState(initial)
  const [, startTransition] = useTransition()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  // id estable para dnd-kit: evita el mismatch de hidratación en sus ids internos.
  const dndId = useId()

  function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id)
    const target = e.over?.id as OpportunityState | undefined
    if (!target) return
    const opp = items.find((o) => o.id === id)
    if (!opp || opp.estado === target) return

    // "perdido" pide motivo.
    let motivo: string | undefined
    if (target === "perdido") {
      motivo = window.prompt("Motivo de pérdida (opcional):") ?? undefined
    }

    const prev = items
    setItems((cur) => cur.map((o) => (o.id === id ? { ...o, estado: target } : o)))
    startTransition(async () => {
      const res = await moveOpportunityAction(id, target, motivo)
      if (res?.error) setItems(prev) // rollback
    })
  }

  return (
    <DndContext id={dndId} sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {OPPORTUNITY_STATES.map((estado) => (
          <Column key={estado} estado={estado} items={items.filter((o) => o.estado === estado)} />
        ))}
      </div>
    </DndContext>
  )
}
