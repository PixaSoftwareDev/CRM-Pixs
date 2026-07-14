"use client"

import { useRouter } from "next/navigation"
import { useActionState, useState, useTransition } from "react"
import { KebabMenu } from "@/components/KebabMenu"
import { Modal } from "@/components/Modal"
import { Button } from "@/components/ui"
import type { Contact } from "@/db/schema"
import { type ActionState, deleteContact, updateContact } from "@/modules/contacts/actions"
import { ContactFields } from "./ContactFields"

/**
 * Menú ⋮ de un contacto: Editar (modal) / Eliminar.
 * `onDeletedHref` → a dónde navegar tras borrar (en la vista de detalle);
 * si no se pasa, solo refresca (en las cards del listado).
 */
export function ContactActions({
  contact,
  onDeletedHref,
  className,
}: {
  contact: Contact
  onDeletedHref?: string
  className?: string
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [, startTransition] = useTransition()
  const [state, action, pending] = useActionState<ActionState, FormData>(async (prev, fd) => {
    const res = await updateContact(contact.id, prev, fd)
    if (res.ok) {
      setEditing(false)
      router.refresh()
    }
    return res
  }, {})

  function handleDelete() {
    if (!window.confirm(`¿Eliminar el cliente "${contact.nombre}"?`)) return
    startTransition(async () => {
      await deleteContact(contact.id)
      if (onDeletedHref) router.push(onDeletedHref)
      else router.refresh()
    })
  }

  return (
    <div className={className}>
      <KebabMenu onEdit={() => setEditing(true)} onDelete={handleDelete} />
      {editing ? (
        <Modal
          title="Editar cliente"
          description="Actualizá los datos del cliente"
          onClose={() => setEditing(false)}
        >
          <form action={action} className="space-y-4">
            <ContactFields defaults={state.values ?? contact} />
            {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
            <div className="flex justify-end gap-2 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando…" : "Guardar cambios"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  )
}
