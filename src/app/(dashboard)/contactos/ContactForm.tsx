"use client"

import { useRouter } from "next/navigation"
import { useActionState, useState } from "react"
import { Modal } from "@/components/Modal"
import { Button } from "@/components/ui"
import { type ActionState, createContact } from "@/modules/contacts/actions"
import { ContactFields } from "./ContactFields"

export function ContactForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState<ActionState, FormData>(async (prev, fd) => {
    const res = await createContact(prev, fd)
    if (res.ok) {
      setOpen(false)
      router.refresh()
    }
    return res
  }, {})

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ Nuevo cliente</Button>

      {open ? (
        <Modal
          title="Nuevo cliente"
          description="El negocio con el que trabajás"
          onClose={() => setOpen(false)}
        >
          <form action={action} className="space-y-4">
            <ContactFields />

            {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}

            <div className="flex justify-end gap-2 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando…" : "Crear cliente"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  )
}
