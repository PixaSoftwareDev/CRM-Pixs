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
import { useActionState, useId, useRef, useState, useTransition } from "react"
import { Button, Input } from "@/components/ui"
import { TASK_COLUMNS, type TaskColumn } from "@/db/schema"
import type { FormState } from "@/lib/forms"
import { cn, formatDate } from "@/lib/utils"
import { createTask, moveTask } from "@/modules/tasks/actions"
import type { TaskRow } from "@/modules/tasks/queries"

const COLUMN_LABELS: Record<TaskColumn, string> = {
  backlog: "Backlog",
  en_curso: "En curso",
  revision: "Revisión",
  hecho: "Hecho",
}

function Card({ task }: { task: TaskRow }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id })
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
      <div className="font-medium">{task.titulo}</div>
      {task.venceAt ? (
        <div className="mt-1 text-xs text-zinc-400">Vence {formatDate(task.venceAt)}</div>
      ) : null}
      {task.asignadoNombre ? (
        <div className="mt-1 text-xs text-zinc-400">{task.asignadoNombre}</div>
      ) : null}
    </div>
  )
}

function Column({ estado, items }: { estado: TaskColumn; items: TaskRow[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: estado })
  return (
    <div className="flex min-w-[13rem] flex-1 flex-col">
      <div className="mb-2 px-1 text-sm font-medium text-zinc-500">
        {COLUMN_LABELS[estado]} <span className="text-zinc-400">· {items.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-32 flex-1 flex-col gap-2 rounded-lg bg-zinc-100/60 p-2 dark:bg-zinc-900/40",
          isOver && "ring-2 ring-zinc-400",
        )}
      >
        {items.map((t) => (
          <Card key={t.id} task={t} />
        ))}
      </div>
    </div>
  )
}

export function TaskBoard({ projectId, initial }: { projectId: string; initial: TaskRow[] }) {
  const [items, setItems] = useState(initial)
  const [, startTransition] = useTransition()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const formRef = useRef<HTMLFormElement>(null)
  // id estable para dnd-kit: evita el mismatch de hidratación en sus ids internos.
  const dndId = useId()

  const [, addAction, pending] = useActionState<FormState, FormData>(async (_p, fd) => {
    const res = await createTask(_p, fd)
    if (res.ok) formRef.current?.reset()
    return res
  }, {})

  function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id)
    const target = e.over?.id as TaskColumn | undefined
    if (!target) return
    const task = items.find((t) => t.id === id)
    if (!task || task.estado === target) return

    const prev = items
    setItems((cur) => cur.map((t) => (t.id === id ? { ...t, estado: target } : t)))
    startTransition(async () => {
      const res = await moveTask(id, target, projectId)
      if (res?.error) setItems(prev)
    })
  }

  return (
    <div>
      <form ref={formRef} action={addAction} className="mb-4 flex max-w-md gap-2">
        <input type="hidden" name="projectId" value={projectId} />
        <Input name="titulo" placeholder="Nueva tarea…" required />
        <Button type="submit" disabled={pending}>
          Agregar
        </Button>
      </form>
      <DndContext id={dndId} sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {TASK_COLUMNS.map((estado) => (
            <Column key={estado} estado={estado} items={items.filter((t) => t.estado === estado)} />
          ))}
        </div>
      </DndContext>
    </div>
  )
}
