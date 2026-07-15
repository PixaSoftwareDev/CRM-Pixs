"use client"

import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useActionState, useEffect, useId, useState, useTransition } from "react"
import { useConfirm } from "@/components/ConfirmDialog"
import { KebabMenu } from "@/components/KebabMenu"
import { KANBAN_CARD, KanbanBoardShell, KanbanColumn } from "@/components/kanban"
import { Modal } from "@/components/Modal"
import { Badge, Button } from "@/components/ui"
import { OPPORTUNITY_STATES, type OpportunityState } from "@/db/schema"
import { cn, formatMoney } from "@/lib/utils"
import {
  type ActionState,
  deleteOpportunity,
  moveOpportunityAction,
  updateOpportunity,
} from "@/modules/opportunities/actions"
import { STATE_LABELS, STATE_TONES } from "@/modules/opportunities/labels"
import type { OpportunityWithContact } from "@/modules/opportunities/queries"
import { OpportunityFields } from "./OpportunityFields"

type Contacto = { id: string; nombre: string }

/** Contenido visual de la tarjeta (reutilizado por el DragOverlay). */
function CardBody({ opp }: { opp: OpportunityWithContact }) {
  return (
    <>
      <div className="mt-1 text-xs text-zinc-500">
        {opp.contactoNombre}
        {opp.personaContacto ? ` · ${opp.personaContacto}` : ""}
      </div>
      {opp.valorEstimado ? (
        <div className="mt-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
          {formatMoney(opp.valorEstimado, opp.moneda)}
        </div>
      ) : null}
    </>
  )
}

function Card({
  opp,
  onEdit,
  onDelete,
}: {
  opp: OpportunityWithContact
  onEdit: (o: OpportunityWithContact) => void
  onDelete: (o: OpportunityWithContact) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: opp.id })
  return (
    // El arrastre real lo muestra el DragOverlay; acá no aplicamos transform para
    // no extender el área de scroll (evita el "scroll infinito" al arrastrar).
    <div
      ref={setNodeRef}
      className={cn("group cursor-grab hover:shadow-md", KANBAN_CARD, isDragging && "opacity-40")}
      {...listeners}
      {...attributes}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/pipeline/${opp.id}`}
          className="font-medium hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {opp.titulo}
        </Link>
        <KebabMenu onEdit={() => onEdit(opp)} onDelete={() => onDelete(opp)} />
      </div>
      <CardBody opp={opp} />
    </div>
  )
}

function Column({
  estado,
  items,
  onEdit,
  onDelete,
}: {
  estado: OpportunityState
  items: OpportunityWithContact[]
  onEdit: (o: OpportunityWithContact) => void
  onDelete: (o: OpportunityWithContact) => void
}) {
  const total = items.reduce((s, o) => s + Number(o.valorEstimado ?? 0), 0)
  return (
    <KanbanColumn
      id={estado}
      count={items.length}
      header={<Badge tone={STATE_TONES[estado]}>{STATE_LABELS[estado]}</Badge>}
      footer={total > 0 ? formatMoney(total) : undefined}
    >
      {items.map((o) => (
        <Card key={o.id} opp={o} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </KanbanColumn>
  )
}

export function KanbanBoard({
  initial,
  contactos,
}: {
  initial: OpportunityWithContact[]
  contactos: Contacto[]
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const [items, setItems] = useState(initial)
  const [editing, setEditing] = useState<OpportunityWithContact | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  // id estable para dnd-kit: evita el mismatch de hidratación en sus ids internos.
  const dndId = useId()

  // Sincroniza con el servidor tras crear/editar/mover (revalidate → nuevo initial).
  useEffect(() => {
    setItems(initial)
  }, [initial])

  const [editState, editAction, editPending] = useActionState<ActionState, FormData>(
    async (prev, fd) => {
      const res = await updateOpportunity(prev, fd)
      if (res.ok) {
        setEditing(null)
        router.refresh()
      }
      return res
    },
    {},
  )

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null)
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

  async function handleDelete(opp: OpportunityWithContact) {
    const ok = await confirm({
      title: "Eliminar oportunidad",
      message: `¿Eliminar la oportunidad "${opp.titulo}"? Esta acción no se puede deshacer.`,
      danger: true,
    })
    if (!ok) return
    const prev = items
    setItems((cur) => cur.filter((o) => o.id !== opp.id))
    startTransition(async () => {
      try {
        await deleteOpportunity(opp.id)
        router.refresh()
      } catch {
        setItems(prev) // rollback
      }
    })
  }

  const activeOpp = activeId ? items.find((o) => o.id === activeId) : null

  return (
    <>
      <DndContext
        id={dndId}
        sensors={sensors}
        onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={onDragEnd}
      >
        <KanbanBoardShell>
          {OPPORTUNITY_STATES.map((estado) => (
            <Column
              key={estado}
              estado={estado}
              items={items.filter((o) => o.estado === estado)}
              onEdit={setEditing}
              onDelete={handleDelete}
            />
          ))}
        </KanbanBoardShell>
        <DragOverlay>
          {activeOpp ? (
            <div className={cn(KANBAN_CARD, "cursor-grabbing shadow-lg")}>
              <div className="font-medium">{activeOpp.titulo}</div>
              <CardBody opp={activeOpp} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {editing ? (
        <Modal
          title="Editar oportunidad"
          description="Actualizá los datos del negocio"
          onClose={() => setEditing(null)}
        >
          <form key={editing.id} action={editAction} className="space-y-4">
            <input type="hidden" name="id" defaultValue={editing.id} />
            <OpportunityFields
              contactos={contactos}
              defaults={{
                contactId: editing.contactId,
                titulo: editing.titulo,
                valorEstimado: editing.valorEstimado,
                probabilidad: editing.probabilidad,
              }}
            />
            {editState.error ? <p className="text-sm text-red-600">{editState.error}</p> : null}
            <div className="flex justify-end gap-2 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={editPending}>
                {editPending ? "Guardando…" : "Guardar cambios"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  )
}
