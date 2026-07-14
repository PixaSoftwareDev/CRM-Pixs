"use client"

import { useRouter } from "next/navigation"
import { useActionState, useState } from "react"
import { Modal } from "@/components/Modal"
import { Button } from "@/components/ui"
import { type ActionState, createOpportunity } from "@/modules/opportunities/actions"
import { OpportunityFields } from "./OpportunityFields"

export function NewOpportunity({ contactos }: { contactos: { id: string; nombre: string }[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState<ActionState, FormData>(async (prev, fd) => {
    const res = await createOpportunity(prev, fd)
    if (res.ok) {
      setOpen(false)
      router.refresh()
    }
    return res
  }, {})

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={contactos.length === 0}>
        + Nueva oportunidad
      </Button>
      {open ? (
        <Modal
          title="Nueva oportunidad"
          description="Un negocio a seguir en el embudo"
          onClose={() => setOpen(false)}
        >
          <form action={action} className="space-y-4">
            <OpportunityFields contactos={contactos} />
            {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
            <div className="flex justify-end gap-2 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando…" : "Crear oportunidad"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  )
}
